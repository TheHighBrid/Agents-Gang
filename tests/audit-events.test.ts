import { describe, expect, test } from "vitest";

import { createInMemoryExecutionRepository } from "../lib/execution/repository";

describe("execution audit events", () => {
  test("records a structured blocked tool event without raw payload data", async () => {
    const repository = createInMemoryExecutionRepository({
      idFactory: () => "audit-1",
      clock: () => new Date("2026-08-15T12:00:00.000Z"),
    });

    const event = await repository.recordAuditEvent({
      runId: "run-1",
      agentName: "shopify_ops_agent",
      toolName: "shopify.product.update",
      riskLevel: 3,
      eventType: "tool.execution",
      outcome: "blocked",
      metadata: { errorCode: "approval_required" },
    });

    expect(event).toEqual({
      id: "audit-1",
      runId: "run-1",
      agentName: "shopify_ops_agent",
      toolName: "shopify.product.update",
      riskLevel: 3,
      eventType: "tool.execution",
      outcome: "blocked",
      metadata: { errorCode: "approval_required" },
      createdAt: "2026-08-15T12:00:00.000Z",
    });
    await expect(repository.listAuditEvents()).resolves.toEqual([event]);
  });
});
