import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { getDashboardSnapshotResponse } from "../lib/dashboard/dashboard-api";

describe("dashboard snapshot", () => {
  test("returns persisted execution, correlation, and safe scheduler health in one response", async () => {
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
      eventType: "run.correlation",
      outcome: "succeeded",
      metadata: { correlationId: "corr.dashboard:run-001", payload: "must-not-render" },
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

    const claim = await repository.claimScheduledJob({
      jobName: "job.daily_melato_audit",
      idempotencyKey: "daily-melato-audit:dashboard-001",
      agentName: "shopify_ops_agent",
      maxAttempts: 3,
      leaseSeconds: 300,
    });
    const retryAt = new Date(Date.now() + 60_000).toISOString();
    await repository.completeScheduledJob({
      jobId: claim.job.id,
      status: "retry_scheduled",
      retryable: true,
      lastErrorCode: "shopify_rate_limited",
      nextRetryAt: retryAt,
    });
    await repository.recordAuditEvent({
      agentName: "shopify_ops_agent",
      eventType: "scheduled_job.retry_scheduled",
      outcome: "blocked",
      metadata: {
        scheduledJobId: claim.job.id,
        correlationId: "corr.dashboard:job-001",
        payload: "must-not-render-either",
      },
    });

    const response = await getDashboardSnapshotResponse(repository);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({ id: run.id, correlationId: "corr.dashboard:run-001" });
    expect(body.routingDecisions).toHaveLength(1);
    expect(body.toolCalls).toHaveLength(1);
    expect(body.auditEvents).toHaveLength(3);
    expect(body.scheduledJobs).toEqual([
      expect.objectContaining({
        id: claim.job.id,
        jobName: "job.daily_melato_audit",
        status: "retry_scheduled",
        attemptCount: 1,
        maxAttempts: 3,
        retryable: true,
        lastErrorCode: "shopify_rate_limited",
        nextRetryAt: retryAt,
        correlationId: "corr.dashboard:job-001",
        recommendedAction: "wait_for_retry",
      }),
    ]);
    expect(body.operationalHealth).toMatchObject({
      windowMinutes: 15,
      metrics: expect.objectContaining({
        failedJobs: 0,
        providerTimeouts: 0,
        persistenceTimeouts: 0,
        blockedActions: 0,
      }),
    });
    expect(body.approvals).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("must-not-render");
  });
});
