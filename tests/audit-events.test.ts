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


test("returns in-memory dashboard records newest first", async () => {
  let tick = 0;
  const repository = createInMemoryExecutionRepository({
    clock: () => new Date(`2026-08-17T12:00:0${tick++}.000Z`),
    idFactory: (() => {
      let id = 0;
      return () => `record-${++id}`;
    })(),
  });

  const firstRun = await repository.createAgentRun({
    agentName: "product_page_agent",
    provider: "anthropic",
    model: "claude-test",
    routeAgent: "product_page_agent",
    riskLevel: 1,
  });
  const secondRun = await repository.createAgentRun({
    agentName: "creative_director_agent",
    provider: "anthropic",
    model: "claude-test",
    routeAgent: "creative_director_agent",
    riskLevel: 2,
  });
  await repository.recordRoutingDecision({
    runId: firstRun.id,
    selectedAgent: "product_page_agent",
    riskLevel: 1,
    reason: "First route",
    neededTools: [],
    approvalRequired: false,
  });
  await repository.recordRoutingDecision({
    runId: secondRun.id,
    selectedAgent: "creative_director_agent",
    riskLevel: 2,
    reason: "Second route",
    neededTools: [],
    approvalRequired: false,
  });
  await repository.recordAuditEvent({
    runId: firstRun.id,
    eventType: "first.event",
    outcome: "succeeded",
    metadata: {},
  });
  await repository.recordAuditEvent({
    runId: secondRun.id,
    eventType: "second.event",
    outcome: "succeeded",
    metadata: {},
  });

  await expect(repository.listAgentRuns()).resolves.toMatchObject([
    { id: "record-2" },
    { id: "record-1" },
  ]);
  await expect(repository.listRoutingDecisions()).resolves.toMatchObject([
    { selectedAgent: "creative_director_agent" },
    { selectedAgent: "product_page_agent" },
  ]);
  await expect(repository.listAuditEvents()).resolves.toMatchObject([
    { eventType: "second.event" },
    { eventType: "first.event" },
  ]);
});
