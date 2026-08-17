import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runScheduledJob } from "../jobs/scheduledJobRunner";

describe("scheduled job runner", () => {
  test("persists a completed run, route, and audit event", async () => {
    const repository = createInMemoryExecutionRepository({
      idFactory: (() => {
        let id = 0;
        return () => `record-${++id}`;
      })(),
    });

    const result = await runScheduledJob(repository, {
      agentName: "shopify_ops_agent",
      provider: "system",
      model: "governed-tool-runner",
      routeAgent: "shopify_ops_agent",
      riskLevel: 1,
      inputSummary: "Scheduled product-page scan.",
      reason: "The daily schedule requested a Shopify product scan.",
      neededTools: ["shopify.products.read"],
      execute: async () => ({ products: [], first: 50 }),
      summarize: () => "Product-page scan completed.",
    });

    expect(result.data).toEqual({ products: [], first: 50 });
    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      { id: "record-1", status: "completed", outputSummary: "Product-page scan completed." },
    ]);
    await expect(repository.listRoutingDecisions()).resolves.toMatchObject([
      { runId: "record-1", selectedAgent: "shopify_ops_agent" },
    ]);
    await expect(repository.listAuditEvents()).resolves.toMatchObject([
      { runId: "record-1", eventType: "scheduled_job.completed", outcome: "succeeded" },
    ]);
  });

  test("marks a failed run and records an audit event when execution throws", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: () => "record-1" });

    await expect(
      runScheduledJob(repository, {
        agentName: "trend_radar_agent",
        provider: "system",
        model: "governed-job-runner",
        routeAgent: "trend_radar_agent",
        riskLevel: 1,
        inputSummary: "Weekly trend radar.",
        reason: "The weekly schedule requested trend research.",
        neededTools: ["web.search"],
        execute: async () => {
          throw new Error("upstream unavailable");
        },
        summarize: () => "Trend radar completed.",
      }),
    ).rejects.toThrow("upstream unavailable");

    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      { id: "record-1", status: "failed", errorCode: "scheduled_job_failed" },
    ]);
    await expect(repository.listAuditEvents()).resolves.toMatchObject([
      {
        runId: "record-1",
        eventType: "scheduled_job.failed",
        outcome: "failed",
        metadata: { errorCode: "scheduled_job_failed" },
      },
    ]);
  });
});


test("suppresses a duplicate trigger with the same idempotency key", async () => {
  const repository = createInMemoryExecutionRepository({ idFactory: () => "record-1" });
  let executions = 0;
  const definition = {
    idempotencyKey: "daily-audit:2026-08-17",
    agentName: "shopify_ops_agent",
    provider: "system",
    model: "governed-tool-runner",
    routeAgent: "shopify_ops_agent",
    riskLevel: 1 as const,
    inputSummary: "Daily audit.",
    reason: "Scheduled audit.",
    neededTools: ["shopify.products.read"],
    execute: async () => {
      executions += 1;
      return { ok: true };
    },
    summarize: () => "Completed.",
  };

  const first = await runScheduledJob(repository, definition);
  const duplicate = await runScheduledJob(repository, definition);

  expect(first.duplicate).toBe(false);
  expect(duplicate).toMatchObject({ runId: "record-1", duplicate: true });
  expect(executions).toBe(1);
  await expect(repository.listAgentRuns()).resolves.toHaveLength(1);
});

test("persists retryable failure classification", async () => {
  const repository = createInMemoryExecutionRepository({ idFactory: () => "retry-run-1" });

  await expect(
    runScheduledJob(repository, {
      idempotencyKey: "trend:2026-08-17",
      agentName: "trend_radar_agent",
      provider: "system",
      model: "governed-job-runner",
      routeAgent: "trend_radar_agent",
      riskLevel: 1,
      inputSummary: "Trend radar.",
      reason: "Weekly trend research.",
      neededTools: ["web.search"],
      retryClass: "transient",
      execute: async () => {
        throw new Error("provider timeout");
      },
      summarize: () => "Done.",
    }),
  ).rejects.toThrow("provider timeout");

  await expect(repository.listAgentRuns()).resolves.toMatchObject([
    { errorCode: "scheduled_job_retryable" },
  ]);
  await expect(repository.listAuditEvents()).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        eventType: "scheduled_job.failed",
        metadata: expect.objectContaining({ retryClass: "transient" }),
      }),
    ]),
  );
});


test("prevents concurrent workers from executing the same leased job", async () => {
  const repository = createInMemoryExecutionRepository({ idFactory: () => "concurrent-run-1" });
  let executions = 0;
  let unblock!: () => void;
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve;
  });

  const definition = (ownerId: string) => ({
    ownerId,
    idempotencyKey: "concurrent-daily-audit",
    leaseDurationMs: 60_000,
    agentName: "shopify_ops_agent",
    provider: "system",
    model: "governed-tool-runner",
    routeAgent: "shopify_ops_agent",
    riskLevel: 1 as const,
    inputSummary: "Concurrent audit.",
    reason: "Concurrent schedule delivery.",
    neededTools: ["shopify.products.read"],
    execute: async () => {
      executions += 1;
      await blocked;
      return { ok: true };
    },
    summarize: () => "Completed.",
  });

  const firstPromise = runScheduledJob(repository, definition("worker-a"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await runScheduledJob(repository, definition("worker-b"));
  unblock();
  const first = await firstPromise;

  expect(second).toMatchObject({ duplicate: true, skippedReason: "lease_contended" });
  expect(first.duplicate).toBe(false);
  expect(executions).toBe(1);
});
