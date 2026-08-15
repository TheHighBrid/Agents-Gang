import { describe, expect, test } from "vitest";

import { createExecutionRepository } from "../lib/execution/execution-repository-factory";

describe("execution repository factory", () => {
  test("creates the durable Supabase repository from explicit configuration", () => {
    const repository = createExecutionRepository({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
    });

    expect(repository).toHaveProperty("createAgentRun");
    expect(repository).toHaveProperty("recordToolCall");
  });
});
