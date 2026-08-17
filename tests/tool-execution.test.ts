import { describe, expect, test } from "vitest";

import { createInMemoryExecutionRepository, type ExecutionRepository } from "../lib/execution/repository";
import { defineTool, executeTool } from "../lib/execution/tool-execution";

const productUpdateTool = defineTool({
  name: "shopify.product.update",
  capability: "execute",
  riskLevel: 3,
  parseInput(input) {
    if (!input || typeof input !== "object" || !("productId" in input)) {
      throw new Error("productId is required");
    }
    return input as { productId: string };
  },
  getTarget(input) {
    return { type: "shopify_product", id: input.productId };
  },
  async execute() {
    return { updated: true };
  },
});

async function createApprovedAction(
  repository: ExecutionRepository,
  actionType: string,
  targetId = "gid://shopify/Product/123",
) {
  const request = await repository.createApproval({
    requestingAgent: "shopify_ops_agent",
    actionType,
    target: { type: "shopify_product", id: targetId },
    riskLevel: 3,
    payloadSummary: "Update product description.",
  });
  return repository.decideApproval({
    approvalId: request.id,
    status: "approved",
    result: "Approved.",
  });
}

describe("common tool execution contract", () => {
  test("blocks an unapproved high-risk tool before execution and records the attempt", async () => {
    const repository = createInMemoryExecutionRepository({
      clock: () => new Date("2026-08-15T12:00:00.000Z"),
      idFactory: () => "record-1",
    });
    let executionCount = 0;
    const tool = defineTool({
      ...productUpdateTool,
      async execute() {
        executionCount += 1;
        return { updated: true };
      },
    });

    const result = await executeTool({
      repository,
      runId: "run-1",
      agentName: "shopify_ops_agent",
    }, tool, { productId: "gid://shopify/Product/123" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "approval_required",
        message: "An approved approval request is required before this tool can execute.",
        retriable: false,
      },
    });
    expect(executionCount).toBe(0);
    expect(await repository.listToolCalls()).toMatchObject([
      {
        runId: "run-1",
        agentName: "shopify_ops_agent",
        toolName: "shopify.product.update",
        capability: "execute",
        riskLevel: 3,
        outcome: "blocked",
        errorCode: "approval_required",
      },
    ]);
    expect(await repository.listAuditEvents()).toMatchObject([
      {
        runId: "run-1",
        agentName: "shopify_ops_agent",
        toolName: "shopify.product.update",
        riskLevel: 3,
        eventType: "tool.execution",
        outcome: "blocked",
        metadata: { errorCode: "approval_required" },
      },
    ]);
  });

  test("allows an approval resolved from repository state for the matching action and target", async () => {
    const repository = createInMemoryExecutionRepository();
    const approval = await createApprovedAction(repository, "shopify.product.update");

    const result = await executeTool({
      repository,
      runId: "run-1",
      agentName: "shopify_ops_agent",
      approvalId: approval.id,
    }, productUpdateTool, { productId: "gid://shopify/Product/123" });

    expect(result).toEqual({ ok: true, data: { updated: true } });
  });

  test("blocks an approval that authorizes a different action", async () => {
    const repository = createInMemoryExecutionRepository();
    const approval = await createApprovedAction(repository, "shopify.product.publish");
    let executionCount = 0;
    const tool = defineTool({
      ...productUpdateTool,
      async execute() {
        executionCount += 1;
        return { updated: true };
      },
    });

    const result = await executeTool({
      repository,
      runId: "run-1",
      agentName: "shopify_ops_agent",
      approvalId: approval.id,
    }, tool, { productId: "gid://shopify/Product/123" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "approval_required" },
    });
    expect(executionCount).toBe(0);
  });

  test("blocks an approved action when the approved target differs from the requested target", async () => {
    const repository = createInMemoryExecutionRepository();
    const approval = await createApprovedAction(
      repository,
      "shopify.product.update",
      "gid://shopify/Product/999",
    );
    let executionCount = 0;
    const tool = defineTool({
      ...productUpdateTool,
      async execute() {
        executionCount += 1;
        return { updated: true };
      },
    });

    const result = await executeTool({
      repository,
      runId: "run-1",
      agentName: "shopify_ops_agent",
      approvalId: approval.id,
    }, tool, { productId: "gid://shopify/Product/123" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "approval_required" },
    });
    expect(executionCount).toBe(0);
  });
});


test("records a tool failure as an audit event", async () => {
  const repository = createInMemoryExecutionRepository();
  const failingTool = defineTool({
    name: "shopify.products.read",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput: () => ({}),
    async execute() {
      throw new Error("Shopify is unavailable");
    },
  });

  const result = await executeTool({
    repository,
    runId: "run-1",
    agentName: "shopify_ops_agent",
  }, failingTool, {});

  expect(result).toEqual({
    ok: false,
    error: {
      code: "tool_execution_failed",
      message: "Shopify is unavailable",
      retriable: true,
    },
  });
  await expect(repository.listAuditEvents()).resolves.toMatchObject([
    {
      runId: "run-1",
      toolName: "shopify.products.read",
      eventType: "tool.execution",
      outcome: "failed",
      metadata: { errorCode: "tool_execution_failed" },
    },
  ]);
});


test("propagates correlation IDs through tool calls and audit events", async () => {
  const repository = createInMemoryExecutionRepository();
  const readTool = defineTool({
    name: "shopify.products.read",
    capability: "read" as const,
    riskLevel: 1 as const,
    parseInput: () => ({}),
    async execute() { return { products: [] }; },
  });

  await executeTool({
    repository,
    runId: "run-1",
    agentName: "shopify_ops_agent",
    correlationId: "corr-tool-001",
  }, readTool, {});

  await expect(repository.listToolCalls()).resolves.toMatchObject([
    { correlationId: "corr-tool-001" },
  ]);
  await expect(repository.listAuditEvents()).resolves.toMatchObject([
    { correlationId: "corr-tool-001" },
  ]);
});
