import { beforeEach, describe, expect, test, vi } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";

let repository = createInMemoryExecutionRepository({ idFactory: () => "record-1" });

vi.mock("../lib/execution/execution-repository-factory", () => ({
  createExecutionRepository: () => repository,
}));

import { GET } from "../app/api/dashboard/route";

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    repository = createInMemoryExecutionRepository({ idFactory: () => "record-1" });
  });

  test("returns persisted runs, routing decisions, and audit events", async () => {
    const run = await repository.createAgentRun({
      agentName: "product_page_agent",
      provider: "anthropic",
      model: "claude-test",
      routeAgent: "product_page_agent",
      riskLevel: 1,
      inputSummary: "Audit a product page.",
    });
    await repository.recordRoutingDecision({
      runId: run.id,
      selectedAgent: "product_page_agent",
      riskLevel: 1,
      reason: "Product audit request.",
      neededTools: ["shopify.products.read"],
      approvalRequired: false,
    });
    await repository.recordAuditEvent({
      runId: run.id,
      agentName: "product_page_agent",
      eventType: "agent.run.started",
      outcome: "succeeded",
      metadata: { source: "chat" },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runs: [{ id: "record-1", agentName: "product_page_agent" }],
      routingDecisions: [{ runId: "record-1", selectedAgent: "product_page_agent" }],
      auditEvents: [{ runId: "record-1", eventType: "agent.run.started" }],
    });
  });
});


test("returns payload-safe operational metrics and alert summaries", async () => {
  const run = await repository.createAgentRun({
    agentName: "shopify_ops_agent",
    provider: "system",
    model: "governed-tool-runner",
    routeAgent: "shopify_ops_agent",
    riskLevel: 1,
  });
  await repository.completeAgentRun({ runId: run.id, status: "failed", errorCode: "scheduled_job_failed" });
  for (let index = 0; index < 5; index += 1) {
    await repository.recordAuditEvent({
      runId: run.id,
      eventType: "tool.execution",
      outcome: "blocked",
      metadata: { sensitivePayload: "must-not-leak" },
    });
  }

  const response = await GET();
  const data = await response.json();

  expect(data.operationalHealth).toMatchObject({
    metrics: { failedRuns: 1, blockedEvents: 5 },
    alerts: [expect.objectContaining({ key: "repeated_blocks", severity: "warning" })],
  });
  expect(JSON.stringify(data.operationalHealth)).not.toContain("must-not-leak");
});
