import { createHash } from "node:crypto";

import type { ExecutionRepository } from "./repository";
import { createSupabaseExecutionRepository } from "./supabase-repository";

type ExecutionEnvironment = Record<string, string | undefined>;

export class ExecutionRepositoryConfigurationError extends Error {
  readonly status = 500;

  constructor(message: string) {
    super(message);
    this.name = "ExecutionRepositoryConfigurationError";
  }
}

function createSupabaseRequest(serviceRoleKey: string) {
  if (!serviceRoleKey.startsWith("sb_secret_")) return fetch;

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.delete("Authorization");
    const response = await fetch(input, { ...init, headers });

    if (process.env.VERCEL_ENV === "preview" && !response.ok) {
      let error = "unknown";
      try {
        const text = await response.clone().text();
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          const candidate = parsed.message ?? parsed.error ?? parsed.code;
          if (typeof candidate === "string") error = candidate.slice(0, 160);
        } catch {
          error = text.slice(0, 160) || "empty";
        }
      } catch {
        error = "unreadable";
      }
      console.info("supabase-response-diagnostic", { status: response.status, error });
    }

    return response;
  };
}

function classifyServerKey(value: string | undefined) {
  const raw = value?.trim() ?? "";
  return {
    configured: Boolean(raw),
    kind: !raw ? "missing" : raw.startsWith("sb_secret_") ? "modern_secret" : raw.startsWith("sb_publishable_") ? "modern_publishable" : raw.startsWith("eyJ") && raw.split(".").length === 3 ? "legacy_jwt" : "unknown",
    length: raw.length,
  };
}

function secretChecksumMatchesProject(key: string | undefined, url: string | undefined) {
  const raw = key?.trim() ?? "";
  if (!raw.startsWith("sb_secret_") || !url) return undefined;

  const separator = raw.lastIndexOf("_");
  if (separator <= "sb_secret_".length) return false;

  let projectRef: string;
  try {
    projectRef = new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return undefined;
  }
  if (!projectRef) return undefined;

  const intermediate = raw.slice(0, separator);
  const actualChecksum = raw.slice(separator + 1);
  const expectedChecksum = createHash("sha256")
    .update(`${projectRef}|${intermediate}`)
    .digest("base64url")
    .slice(0, 8);

  return actualChecksum === expectedChecksum;
}

function resolveSupabaseServerKey(environment: ExecutionEnvironment) {
  if (environment.VERCEL_ENV === "preview") {
    console.info("supabase-server-key-shape", {
      modern: classifyServerKey(environment.SUPABASE_SECRET_KEY),
      legacy: classifyServerKey(environment.SUPABASE_SERVICE_ROLE_KEY),
      modernChecksumMatchesProject: secretChecksumMatchesProject(
        environment.SUPABASE_SECRET_KEY,
        environment.SUPABASE_URL,
      ),
    });
  }

  const modernSecret = environment.SUPABASE_SECRET_KEY?.trim();
  if (modernSecret?.startsWith("sb_secret_")) return modernSecret;

  const legacyServiceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (legacyServiceRoleKey) return legacyServiceRoleKey;

  throw new ExecutionRepositoryConfigurationError(
    "SUPABASE_URL and a Supabase server key are required for governed execution",
  );
}

export function createExecutionRepository(environment: ExecutionEnvironment): ExecutionRepository {
  if (!environment.SUPABASE_URL) {
    throw new ExecutionRepositoryConfigurationError(
      "SUPABASE_URL and a Supabase server key are required for governed execution",
    );
  }

  const serverKey = resolveSupabaseServerKey(environment);

  return createSupabaseExecutionRepository({
    url: environment.SUPABASE_URL,
    serviceRoleKey: serverKey,
    request: createSupabaseRequest(serverKey),
  });
}
