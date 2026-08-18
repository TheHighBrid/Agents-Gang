import { describe, expect, test, vi } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import {
  ManualJobControlError,
  createManualJobController,
  type ManualJobDefinition,
} from "../lib/scheduler/manual-job-controls";

function definition(execute = vi.fn().mockResolvedValue({ ok: true })): ManualJobDefinition<{ ok: boolean }> {
  return {
    name: "job.daily_melato_audit",
    agentName: "shopify_ops_agent",
    inputSummary: "Manual daily Melato audit",
    reason: "Operator requested the approved daily store-health workflow",
    neededTools: ["shopify.products.read", "product.image.audit"],
    execute,
  };
}

describe("protected manual job controls", () => {
  test("runs an eligible job once and audits the operator attempt", async () => {
    const repository = createInMemoryExecutionRepository({
      idFactory: (() => { let n = 0; return () => `id-${++n}`; })(),
    });
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const controller = createManualJobController({ repository, jobs: [definition(execute)] });

    const result = await controller.trigger({
      jobName: "job.daily_melato_audit",
      idempotencyKey: "manual:daily-audit:2026-08-18T06:00Z",
      operatorId: "operator-1",
    });

    expect(result).toMatchObject({ outcome: "completed", attemptCount: 1 });
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(repository.listAuditEvents()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        agentName: "operator_control",
        eventType: "operator.job.triggered",
        outcome: "succeeded",
        metadata: expect.objectContaining({ jobName: "job.daily_melato_audit", operatorId: "operator-1" }),
      }),
    ]));
  });

  test("duplicate and concurrent trigger requests cannot double-execute", async () => {
    const repository = createInMemoryExecutionRepository();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const execute = vi.fn(async () => { await gate; return { ok: true }; });
    const controller = createManualJobController({ repository, jobs: [definition(execute)] });
    const input = {
      jobName: "job.daily_melato_audit",
      idempotencyKey: "manual:daily-audit:duplicate-001",
      operatorId: "operator-1",
    };

    const first = controller.trigger(input);
    await Promise.resolve();
    await expect(controller.trigger(input)).rejects.toMatchObject({ code: "duplicate_trigger", status: 409 });
    release();
    await expect(first).resolves.toMatchObject({ outcome: "completed" });
    await expect(controller.trigger(input)).rejects.toMatchObject({ code: "duplicate_trigger", status: 409 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("rejects ineligible jobs with a deterministic audited error", async () => {
    const repository = createInMemoryExecutionRepository();
    const controller = createManualJobController({ repository, jobs: [definition()] });

    await expect(controller.trigger({
      jobName: "job.unknown",
      idempotencyKey: "manual:unknown:12345678",
      operatorId: "operator-1",
    })).rejects.toMatchObject({ code: "invalid_job", status: 404 });

    await expect(repository.listAuditEvents()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "operator.job.rejected", outcome: "blocked" }),
    ]));
  });

  test("manual retry advances only an existing retryable scheduler record and preserves its idempotency key", async () => {
    let now = new Date("2026-08-18T10:00:00.000Z");
    const repository = createInMemoryExecutionRepository({ clock: () => now });
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const controller = createManualJobController({ repository, jobs: [definition(execute)] });
    const idempotencyKey = "manual:daily-audit:retryable-001";

    const claimed = await repository.claimScheduledJob({
      jobName: "job.daily_melato_audit",
      idempotencyKey,
      agentName: "shopify_ops_agent",
      maxAttempts: 3,
      leaseSeconds: 300,
    });
    await repository.completeScheduledJob({
      jobId: claimed.job.id,
      status: "retry_scheduled",
      retryable: true,
      lastErrorCode: "shopify_rate_limited",
      nextRetryAt: "2026-08-18T11:00:00.000Z",
    });

    now = new Date("2026-08-18T10:05:00.000Z");
    const result = await controller.retry({
      jobName: "job.daily_melato_audit",
      idempotencyKey,
      operatorId: "operator-1",
    });

    expect(result).toMatchObject({ outcome: "completed", attemptCount: 2 });
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(repository.listScheduledJobs()).resolves.toEqual([
      expect.objectContaining({ idempotencyKey, status: "completed", attemptCount: 2 }),
    ]);
  });

  test("rejects non-retryable and exhausted retry requests", async () => {
    const repository = createInMemoryExecutionRepository();
    const controller = createManualJobController({ repository, jobs: [definition()] });

    await expect(controller.retry({
      jobName: "job.daily_melato_audit",
      idempotencyKey: "manual:missing:retry-001",
      operatorId: "operator-1",
    })).rejects.toMatchObject({ code: "retry_not_eligible", status: 409 });

    const claim = await repository.claimScheduledJob({
      jobName: "job.daily_melato_audit",
      idempotencyKey: "manual:exhausted:retry-001",
      agentName: "shopify_ops_agent",
      maxAttempts: 1,
      leaseSeconds: 300,
    });
    await repository.completeScheduledJob({
      jobId: claim.job.id,
      status: "retry_scheduled",
      retryable: true,
      nextRetryAt: "2026-08-18T10:00:00.000Z",
    });

    await expect(controller.retry({
      jobName: "job.daily_melato_audit",
      idempotencyKey: "manual:exhausted:retry-001",
      operatorId: "operator-1",
    })).rejects.toMatchObject({ code: "retry_exhausted", status: 409 });
  });

  test("rejects unsafe idempotency keys before scheduler access", async () => {
    const repository = createInMemoryExecutionRepository();
    const controller = createManualJobController({ repository, jobs: [definition()] });

    await expect(controller.trigger({
      jobName: "job.daily_melato_audit",
      idempotencyKey: "raw customer email body with spaces and secrets",
      operatorId: "operator-1",
    })).rejects.toBeInstanceOf(ManualJobControlError);
    await expect(controller.trigger({
      jobName: "job.daily_melato_audit",
      idempotencyKey: "bad",
      operatorId: "operator-1",
    })).rejects.toMatchObject({ code: "invalid_idempotency_key", status: 400 });
  });
});
