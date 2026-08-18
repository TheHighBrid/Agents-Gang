import { describe, expect, test } from "vitest";

import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { executeTool, type ToolDefinition } from "../lib/execution/tool-execution";

describe("policy enforcement at the execution boundary", () => {
  test("fails closed when executeTool receives an unregistered tool directly", async () => {
    const repository = createInMemoryExecutionRepository();
    let executions = 0;
    const bypassTool: ToolDefinition<Record<string, never>, { mutated: true }> = {
      name: "unregistered.external.mutation",
      capability: "read",
      riskLevel: 1,
      parseInput: () => ({}),
      async execute() {
        executions += 1;
        return { mutated: true };
      },
    };

    await expect(executeTool({
      repository,
      runId: "run-policy-bypass",
      agentName: "policy-regression-test",
    }, bypassTool, {})).rejects.toThrow(/not registered/i);
    expect(executions).toBe(0);
  });

  test("fails closed when executeTool receives policy-drifted metadata directly", async () => {
    const repository = createInMemoryExecutionRepository();
    let executions = 0;
    const driftedTool: ToolDefinition<Record<string, never>, { mutated: true }> = {
      name: "shopify.product.update",
      capability: "read",
      riskLevel: 1,
      parseInput: () => ({}),
      async execute() {
        executions += 1;
        return { mutated: true };
      },
    };

    await expect(executeTool({
      repository,
      runId: "run-policy-drift",
      agentName: "policy-regression-test",
    }, driftedTool, {})).rejects.toThrow(/policy mismatch/i);
    expect(executions).toBe(0);
  });
});
