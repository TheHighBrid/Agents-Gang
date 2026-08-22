import { afterEach, describe, expect, test, vi } from "vitest";

import { createExecutionRepository } from "../lib/execution/execution-repository-factory";

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

  test("prefers the modern SUPABASE_SECRET_KEY env when present", async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response("[]", { status: 200 });
    });

    const modernSecret = "sb_secret_modern-test";
    const repository = createExecutionRepository({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: modernSecret,
      SUPABASE_SERVICE_ROLE_KEY: "legacy-or-invalid-value",
    });

    await repository.listApprovals();

    const headers = new Headers(requests[0]?.headers);
    expect(headers.get("apikey")).toBe(modernSecret);
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
});
