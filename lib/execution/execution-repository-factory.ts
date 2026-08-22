import type { ExecutionRepository } from "./repository";
import { createSupabaseExecutionRepository } from "./supabase-repository";

type ExecutionEnvironment = Record<string, string | undefined>;
type ExecutionRepositoryContext = {
  founderAuthorization?: string;
};

export class ExecutionRepositoryConfigurationError extends Error {
  readonly status = 500;

  constructor(message: string) {
    super(message);
    this.name = "ExecutionRepositoryConfigurationError";
  }
}

function createSupabaseRequest(serviceRoleKey: string) {
  if (!serviceRoleKey.startsWith("sb_secret_")) return fetch;

  return (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.delete("Authorization");
    return fetch(input, { ...init, headers });
  };
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function createStagingBridgeRequest(supabaseUrl: string, founderAuthorization: string) {
  const normalizedUrl = supabaseUrl.replace(/\/$/, "");
  const bridgeUrl = `${normalizedUrl}/functions/v1/agents-gang-persistence-bridge`;

  return (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      return Promise.resolve(Response.json({ error: "Persistence bridge is read-only" }, { status: 403 }));
    }

    const upstreamUrl = new URL(requestUrl(input));
    const restPrefix = "/rest/v1";
    const restIndex = upstreamUrl.pathname.indexOf(restPrefix);
    if (restIndex < 0) {
      return Promise.resolve(Response.json({ error: "Invalid persistence bridge path" }, { status: 400 }));
    }

    const path = `${upstreamUrl.pathname.slice(restIndex + restPrefix.length)}${upstreamUrl.search}`;
    return fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: founderAuthorization,
      },
      body: JSON.stringify({ path, method }),
      cache: "no-store",
    });
  };
}

export function createExecutionRepository(
  environment: ExecutionEnvironment,
  context: ExecutionRepositoryContext = {},
): ExecutionRepository {
  const supabaseUrl = environment.SUPABASE_URL?.trim();
  const staging = environment.AGENTS_GANG_ENVIRONMENT?.trim() === "staging";
  const founderAuthorization = context.founderAuthorization?.trim();

  if (!supabaseUrl) {
    throw new ExecutionRepositoryConfigurationError(
      "SUPABASE_URL is required for governed execution",
    );
  }

  if (staging && context.founderAuthorization !== undefined) {
    if (!founderAuthorization?.startsWith("Bearer ")) {
      throw new ExecutionRepositoryConfigurationError(
        "Founder authorization is required for the staging persistence bridge",
      );
    }

    return createSupabaseExecutionRepository({
      url: supabaseUrl,
      serviceRoleKey: "bridge-managed",
      request: createStagingBridgeRequest(supabaseUrl, founderAuthorization),
    });
  }

  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new ExecutionRepositoryConfigurationError(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for governed execution",
    );
  }

  return createSupabaseExecutionRepository({
    url: supabaseUrl,
    serviceRoleKey,
    request: createSupabaseRequest(serviceRoleKey),
  });
}
