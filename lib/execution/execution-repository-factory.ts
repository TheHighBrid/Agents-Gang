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

export function createExecutionRepository(environment: ExecutionEnvironment): ExecutionRepository {
  if (!environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ExecutionRepositoryConfigurationError(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for governed execution",
    );
  }

  return createSupabaseExecutionRepository({
    url: environment.SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    request: createSupabaseRequest(environment.SUPABASE_SERVICE_ROLE_KEY),
  });
}
