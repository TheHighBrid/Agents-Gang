import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { getExecutions } from "../app/api/executions/route";
import { getNewestFirst, summarizeExecutionHealth } from "../lib/ui/executions";

describe("execution dashboard", () => {
  test("lists persisted runs, routing decisions, tool calls, and audit events", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
    const run = await repository.createAgentRun({ agentName: "shopify_agent", provider: "test", model: "test-model", routeAgent: "shopify_agent", riskLevel: 1 });
    await repository.recordRoutingDecision({ runId: run.id, selectedAgent: "shopify_agent", riskLevel: 1, reason: "Product audit", neededTools: ["shopify.products.read"], approvalRequired: false });
    await repository.recordToolCall({ runId: run.id, agentName: "shopify_agent", toolName: "shopify.products.read", capability: "read", riskLevel: 1, outcome: "succeeded" });
    await repository.recordAuditEvent({ runId: run.id, agentName: "shopify_agent", toolName: "shopify.products.read", eventType: "tool_succeeded", outcome: "succeeded", metadata: {} });

    const response = await getExecutions(new Request("http://localhost/api/executions"), repository, {});
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.runs).toHaveLength(1);
    expect(body.routingDecisions).toHaveLength(1);
    expect(body.toolCalls).toHaveLength(1);
    expect(body.auditEvents).toHaveLength(1);
  });

  test("summarizes execution health for the dashboard", () => {
    expect(summarizeExecutionHealth({
      runs: [
        { status: "completed" },
        { status: "failed" },
        { status: "running" },
      ],
      toolCalls: [
        { outcome: "succeeded" },
        { outcome: "failed" },
        { outcome: "blocked" },
      ],
      approvals: [{ status: "pending" }, { status: "approved" }],
    })).toEqual({ totalRuns: 3, activeRuns: 1, failedRuns: 1, successfulToolCalls: 1, blockedToolCalls: 1, pendingApprovals: 1 });
  });

  test("orders execution records newest-first without mutating the persisted collection", () => {
    const records = [
      { id: "old", createdAt: "2026-08-17T09:00:00.000Z" },
      { id: "new", createdAt: "2026-08-17T11:00:00.000Z" },
      { id: "middle", createdAt: "2026-08-17T10:00:00.000Z" },
    ];

    expect(getNewestFirst(records).map((record) => record.id)).toEqual(["new", "middle", "old"]);
    expect(records.map((record) => record.id)).toEqual(["old", "new", "middle"]);
  });

  test("rejects execution requests when the configured governance key is missing or invalid", async () => {
    const repository = createInMemoryExecutionRepository();
    const missing = await getExecutions(new Request("http://localhost/api/executions"), repository, { APPROVALS_API_KEY: "secret" });
    const invalid = await getExecutions(new Request("http://localhost/api/executions", { headers: { "x-approval-api-key": "wrong" } }), repository, { APPROVALS_API_KEY: "secret" });
    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
  });
});
