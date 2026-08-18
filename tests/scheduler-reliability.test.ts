import { describe, expect, test, vi } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runReliableScheduledJob } from "../jobs/reliableScheduler";

describe("durable scheduler reliability", () => {
  const job = {
    jobName: "inbox_triage",
    agentName: "inbox_triage_agent",
    inputSummary: "Scheduled inbox triage",
    reason: "Review inbox metadata and identify messages requiring attention",
    neededTools: ["gmail.messages.search"],
    idempotencyKey: "inbox_triage:2026-08-18T09:00:00.000Z",
  };

  test("executes an idempotency key once and returns the completed durable job record on duplicate delivery", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
    const execute = vi.fn().mockResolvedValue({ messages: 3 });

    const first = await runReliableScheduledJob({ repository, ...job, execute });
    const duplicate = await runReliableScheduledJob({ repository, ...job, execute });

    expect(first).toMatchObject({ outcome: "completed", attemptCount: 1, data: { messages: 3 } });
    expect(duplicate).toMatchObject({ outcome: "duplicate", job: { idempotencyKey: job.idempotencyKey, status: "completed", attemptCount: 1 } });
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(repository.listScheduledJobs()).resolves.toMatchObject([
      { jobName: "inbox_triage", idempotencyKey: job.idempotencyKey, status: "completed", attemptCount: 1 },
    ]);
  });

  test("blocks a different delivery while the same job has an active lease", async () => {
    const repository = createInMemoryExecutionRepository({ clock: () => new Date("2026-08-18T09:00:00.000Z") });
    const first = await repository.claimScheduledJob({
      jobName: job.jobName,
      idempotencyKey: job.idempotencyKey,
      agentName: job.agentName,
      maxAttempts: 3,
      leaseSeconds: 300,
    });
    const second = await repository.claimScheduledJob({
      jobName: job.jobName,
      idempotencyKey: "inbox_triage:2026-08-18T09:05:00.000Z",
      agentName: job.agentName,
      maxAttempts: 3,
      leaseSeconds: 300,
    });

    expect(first).toMatchObject({ claimed: true });
    expect(second).toMatchObject({ claimed: false, reason: "concurrency_limited", job: { id: first.job.id } });

    await expect(runReliableScheduledJob({
      repository,
      ...job,
      idempotencyKey: "inbox_triage:2026-08-18T09:10:00.000Z",
      execute: async () => ({ messages: 0 }),
    })).resolves.toMatchObject({ outcome: "concurrency_limited", job: { id: first.job.id } });
  });

  test("retries a safe retryable failure and records each governed attempt", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
    const execute = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("provider rate limit"), { code: "gmail_rate_limited", retriable: true }))
      .mockResolvedValueOnce({ messages: 1 });

    const result = await runReliableScheduledJob({
      repository,
      ...job,
      idempotencyKey: "inbox_triage:2026-08-18T10:00:00.000Z",
      retry: { maxAttempts: 3, retryDelayMs: 0, delay: async () => undefined },
      execute,
    });

    expect(result).toMatchObject({ outcome: "completed", attemptCount: 2, data: { messages: 1 } });
    expect(execute).toHaveBeenCalledTimes(2);
    await expect(repository.listScheduledJobs()).resolves.toMatchObject([
      { status: "completed", attemptCount: 2, lastErrorCode: "gmail_rate_limited" },
    ]);
    await expect(repository.listAgentRuns()).resolves.toHaveLength(2);
  });

  test("does not retry an explicitly non-retryable failure", async () => {
    const repository = createInMemoryExecutionRepository();
    const execute = vi.fn().mockRejectedValue(Object.assign(new Error("invalid Gmail credentials"), { code: "gmail_auth_failed", retriable: false }));

    await expect(runReliableScheduledJob({
      repository,
      ...job,
      idempotencyKey: "inbox_triage:2026-08-18T11:00:00.000Z",
      retry: { maxAttempts: 3, retryDelayMs: 0, delay: async () => undefined },
      execute,
    })).rejects.toMatchObject({ code: "gmail_auth_failed" });

    expect(execute).toHaveBeenCalledTimes(1);
    await expect(repository.listScheduledJobs()).resolves.toMatchObject([
      { status: "failed", attemptCount: 1, lastErrorCode: "gmail_auth_failed", retryable: false },
    ]);
  });
});
