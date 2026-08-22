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

  return (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.delete("Authorization");
    return fetch(input, { ...init, headers });
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

function resolveSupabaseServerKey(environment: ExecutionEnvironment) {
  if (environment.VERCEL_ENV === "preview") {
    console.info("supabase-server-key-shape", {
      modern: classifyServerKey(environment.SUPABASE_SECRET_KEY),
      legacy: classifyServerKey(environment.SUPABASE_SERVICE_ROLE_KEY),
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
