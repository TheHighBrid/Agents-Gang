import type { ExecutionRepository, ScheduledJobRecord } from "../lib/execution/repository";
import { createCorrelationId } from "../lib/observability/correlation";
import { runGovernedJob } from "./governedJob";

export type ReliableScheduledJobDefinition<T> = {
  repository: ExecutionRepository;
  jobName: string;
  idempotencyKey: string;
  agentName: string;
  inputSummary: string;
  reason: string;
  neededTools: string[];
  riskLevel?: 1 | 2 | 3 | 4;
  correlationId?: string;
  leaseSeconds?: number;
  retry?: {
    maxAttempts?: number;
    retryDelayMs?: number;
    delay?: (milliseconds: number) => Promise<void>;
  };
  execute: Parameters<typeof runGovernedJob<T>>[0]["execute"];
};

export type ReliableScheduledJobResult<T> =
  | { outcome: "completed"; job: ScheduledJobRecord; attemptCount: number; data: T }
  | { outcome: "duplicate"; job: ScheduledJobRecord; attemptCount: number }
  | { outcome: "concurrency_limited"; job: ScheduledJobRecord; attemptCount: number };

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_RETRY_DELAY_MS = 1_000;

export async function runReliableScheduledJob<T>(
  definition: ReliableScheduledJobDefinition<T>,
): Promise<ReliableScheduledJobResult<T>> {
  const maxAttempts = definition.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = definition.retry?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const correlationId = createCorrelationId(definition.correlationId);
  validateSchedulerConfiguration(maxAttempts, definition.leaseSeconds ?? DEFAULT_LEASE_SECONDS, retryDelayMs);

  while (true) {
    const claim = await definition.repository.claimScheduledJob({
      jobName: definition.jobName,
      idempotencyKey: definition.idempotencyKey,
      agentName: definition.agentName,
      maxAttempts,
      leaseSeconds: definition.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
    });
    if (!claim.claimed) {
      const outcome = claim.reason === "concurrency_limited" ? "concurrency_limited" : "duplicate";
      await definition.repository.recordAuditEvent({
        agentName: definition.agentName,
        eventType: `scheduled_job.${outcome}`,
        outcome: "blocked",
        metadata: schedulerMetadata({
          correlationId,
          jobName: definition.jobName,
          scheduledJobId: claim.job.id,
          attemptCount: claim.job.attemptCount,
        }),
      });
      return {
        outcome,
        job: claim.job,
        attemptCount: claim.job.attemptCount,
      };
    }

    await definition.repository.recordAuditEvent({
      agentName: definition.agentName,
      eventType: "scheduled_job.claimed",
      outcome: "succeeded",
      metadata: schedulerMetadata({
        correlationId,
        jobName: definition.jobName,
        scheduledJobId: claim.job.id,
        attemptCount: claim.job.attemptCount,
      }),
    });

    try {
      const result = await runGovernedJob({
        repository: definition.repository,
        agentName: definition.agentName,
        inputSummary: definition.inputSummary,
        reason: definition.reason,
        neededTools: definition.neededTools,
        riskLevel: definition.riskLevel,
        correlationId,
        execute: definition.execute,
      });
      const job = await definition.repository.completeScheduledJob({
        jobId: claim.job.id,
        status: "completed",
        retryable: false,
      });
      await definition.repository.recordAuditEvent({
        runId: result.run.id,
        agentName: definition.agentName,
        eventType: "scheduled_job.completed",
        outcome: "succeeded",
        metadata: schedulerMetadata({
          correlationId,
          jobName: definition.jobName,
          scheduledJobId: job.id,
          attemptCount: job.attemptCount,
        }),
      });
      return { outcome: "completed", job, attemptCount: job.attemptCount, data: result.data };
    } catch (error) {
      const failure = classifySchedulerFailure(error);
      const retryable = failure.retriable && claim.job.attemptCount < claim.job.maxAttempts;
      const job = await definition.repository.completeScheduledJob({
        jobId: claim.job.id,
        status: retryable ? "retry_scheduled" : "failed",
        retryable,
        lastErrorCode: failure.code,
        nextRetryAt: retryable ? new Date(Date.now() + retryDelayMs).toISOString() : undefined,
      });
      await definition.repository.recordAuditEvent({
        agentName: definition.agentName,
        eventType: retryable ? "scheduled_job.retry_scheduled" : "scheduled_job.failed",
        outcome: retryable ? "blocked" : "failed",
        metadata: schedulerMetadata({
          correlationId,
          jobName: definition.jobName,
          scheduledJobId: job.id,
          attemptCount: job.attemptCount,
          errorCode: failure.code,
          retryable,
        }),
      });
      if (!retryable) throw error;
      await (definition.retry?.delay ?? defaultDelay)(retryDelayMs);
      if (job.status !== "retry_scheduled") throw new Error("Scheduled job retry state was not persisted");
    }
  }
}

function schedulerMetadata(input: {
  correlationId: string;
  jobName: string;
  scheduledJobId: string;
  attemptCount: number;
  errorCode?: string;
  retryable?: boolean;
}) {
  return {
    correlationId: input.correlationId,
    jobName: input.jobName,
    scheduledJobId: input.scheduledJobId,
    attemptCount: input.attemptCount,
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(input.retryable !== undefined ? { retryable: input.retryable } : {}),
  };
}

function classifySchedulerFailure(error: unknown): { code: string; retriable: boolean } {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; retriable?: unknown };
    if (typeof candidate.code === "string" && typeof candidate.retriable === "boolean") {
      return { code: candidate.code, retriable: candidate.retriable };
    }
  }
  return { code: "scheduled_job_failed", retriable: false };
}

function validateSchedulerConfiguration(maxAttempts: number, leaseSeconds: number, retryDelayMs: number) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("maxAttempts must be an integer between 1 and 10");
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 3_600) {
    throw new Error("leaseSeconds must be an integer between 30 and 3600");
  }
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 300_000) {
    throw new Error("retryDelayMs must be an integer between 0 and 300000");
  }
}

async function defaultDelay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
