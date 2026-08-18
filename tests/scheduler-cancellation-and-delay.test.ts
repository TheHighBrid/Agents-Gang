import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";

describe("scheduler cancellation and delayed retry", () => {
  test("cancels a scheduled retry and makes the delivery permanently non-reclaimable", async () => {
    let now = new Date("2026-08-18T09:00:00.000Z");
    const repository = createInMemoryExecutionRepository({ clock: () => now, idFactory: () => "job-1" });
    const idempotencyKey = "inbox_triage:2026-08-18T09:00:00.000Z";

    const first = await repository.claimScheduledJob({
      jobName: "inbox_triage",
      idempotencyKey,
      agentName: "inbox_triage_agent",
      maxAttempts: 3,
      leaseSeconds: 300,
    });
    expect(first.claimed).toBe(true);

    await repository.completeScheduledJob({
      jobId: first.job.id,
      status: "retry_scheduled",
      retryable: true,
      lastErrorCode: "gmail_rate_limited",
      nextRetryAt: "2026-08-18T09:05:00.000Z",
    });

    const cancelled = await repository.cancelScheduledJob({ idempotencyKey });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      retryable: false,
      lastErrorCode: "gmail_rate_limited",
    });
    expect(cancelled.nextRetryAt).toBeUndefined();
    expect(cancelled.completedAt).toBe("2026-08-18T09:00:00.000Z");

    now = new Date("2026-08-18T09:10:00.000Z");
    const replay = await repository.claimScheduledJob({
      jobName: "inbox_triage",
      idempotencyKey,
      agentName: "inbox_triage_agent",
      maxAttempts: 3,
      leaseSeconds: 300,
    });
    expect(replay).toMatchObject({ claimed: false, reason: "duplicate", job: { status: "cancelled", attemptCount: 1 } });
  });

  test("keeps a retry unclaimable until the persisted retry time is due", async () => {
    let now = new Date("2026-08-18T10:00:00.000Z");
    const repository = createInMemoryExecutionRepository({ clock: () => now, idFactory: () => "job-delay" });
    const input = {
      jobName: "weekly_trend_radar",
      idempotencyKey: "weekly_trend_radar:2026-W34",
      agentName: "trend_radar_agent",
      maxAttempts: 3,
      leaseSeconds: 300,
    };

    const first = await repository.claimScheduledJob(input);
    await repository.completeScheduledJob({
      jobId: first.job.id,
      status: "retry_scheduled",
      retryable: true,
      lastErrorCode: "web_timeout",
      nextRetryAt: "2026-08-18T10:05:00.000Z",
    });

    now = new Date("2026-08-18T10:04:59.999Z");
    await expect(repository.claimScheduledJob(input)).resolves.toMatchObject({
      claimed: false,
      reason: "duplicate",
      job: { status: "retry_scheduled", attemptCount: 1 },
    });

    now = new Date("2026-08-18T10:05:00.000Z");
    await expect(repository.claimScheduledJob(input)).resolves.toMatchObject({
      claimed: true,
      job: { status: "running", attemptCount: 2 },
    });
  });
});
