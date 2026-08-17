import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { getDashboardSnapshotResponse } from "../lib/dashboard/dashboard-api";

describe("dashboard snapshot", () => {
  test("returns persisted execution records in one response", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: (() => {
      let index = 0;
      return () => `record-${++index}`;
    })() });
    const run = await repository.createAgentRun({
      agentName: "shopify_ops_agent",
      provider: "anthropic",
      model: "claude-opus-4-8",
      routeAgent: "shopify_ops_agent",
      riskLevel: 1,
      inputSummary: "Audit the product page",
    });
    await repository.recordRoutingDecision({
      runId: run.id,
      selectedAgent: "shopify_ops_agent",
      riskLevel: 1,
      reason: "Product audit request",
      neededTools: ["shopify.products.read"],
      approvalRequired: false,
    });
    await repository.recordToolCall({
      runId: run.id,
      agentName: "shopify_ops_agent",
      toolName: "shopify.products.read",
      capability: "read",
      riskLevel: 1,
      outcome: "succeeded",
    });
    await repository.recordAuditEvent({
      runId: run.id,
      agentName: "shopify_ops_agent",
      toolName: "shopify.products.read",
      riskLevel: 1,
      eventType: "tool.completed",
      outcome: "succeeded",
      metadata: { source: "dashboard-test" },
    });

    const response = await getDashboardSnapshotResponse(repository);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.runs).toHaveLength(1);
    expect(body.routingDecisions).toHaveLength(1);
    expect(body.toolCalls).toHaveLength(1);
    expect(body.auditEvents).toHaveLength(1);
    expect(body.approvals).toEqual([]);
  });
});
