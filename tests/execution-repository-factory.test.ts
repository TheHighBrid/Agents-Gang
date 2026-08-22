import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createExecutionRepository,
  ExecutionRepositoryConfigurationError,
} from "../lib/execution/execution-repository-factory";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("execution repository factory", () => {
  test("creates the durable Supabase repository from explicit configuration", () => {
    const repository = createExecutionRepository({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
    });

    expect(repository).toHaveProperty("createAgentRun");
    expect(repository).toHaveProperty("recordToolCall");
  });

  test("uses only the apikey header for modern Supabase secret keys", async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response("[]", { status: 200 });
    });

    const secretKey = "sb_secret_test";
    const repository = createExecutionRepository({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: secretKey,
    });

    await repository.listApprovals();

    const headers = new Headers(requests[0]?.headers);
    expect(headers.get("apikey")).toBe(secretKey);
    expect(headers.has("Authorization")).toBe(false);
  });

  test("keeps bearer authorization for legacy service_role JWT keys", async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response("[]", { status: 200 });
    });

    const legacyKey = "legacy-service-role-jwt";
    const repository = createExecutionRepository({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: legacyKey,
    });

    await repository.listApprovals();

    const headers = new Headers(requests[0]?.headers);
    expect(headers.get("apikey")).toBe(legacyKey);
    expect(headers.get("Authorization")).toBe(`Bearer ${legacyKey}`);
  });

  test("routes staging dashboard reads through the founder-authenticated Supabase bridge without a database key", async () => {
    const requests: Array<{ input: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input: String(input), init: init ?? {} });
      return Response.json([]);
    });

    const founderAuthorization = "Bearer v1.synthetic-founder-session.signature";
    const repository = createExecutionRepository(
      {
        AGENTS_GANG_ENVIRONMENT: "staging",
        SUPABASE_URL: "https://project.supabase.co",
      },
      { founderAuthorization },
    );

    await repository.listApprovals();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe(
      "https://project.supabase.co/functions/v1/agents-gang-persistence-bridge",
    );
    expect(requests[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(requests[0]?.init.body))).toEqual({
      path: "/approval_requests?select=*&order=created_at.desc,id.desc",
      method: "GET",
    });

    const headers = new Headers(requests[0]?.init.headers);
    expect(headers.get("Authorization")).toBe(founderAuthorization);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.has("apikey")).toBe(false);
    expect(String(requests[0]?.init.body)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("fails closed when staging bridge context has no founder session", () => {
    expect(() => createExecutionRepository(
      {
        AGENTS_GANG_ENVIRONMENT: "staging",
        SUPABASE_URL: "https://project.supabase.co",
      },
      { founderAuthorization: "" },
    )).toThrow(ExecutionRepositoryConfigurationError);
  });

  test("production continues to require an explicit server-side Supabase key", () => {
    expect(() => createExecutionRepository({
      AGENTS_GANG_ENVIRONMENT: "production",
      SUPABASE_URL: "https://project.supabase.co",
    })).toThrow(ExecutionRepositoryConfigurationError);
  });
});
