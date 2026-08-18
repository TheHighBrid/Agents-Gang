import type { ExecutionRepository } from "../execution/repository";
import type { ToolExecutionContext } from "../execution/tool-execution";
import {
  runReliableScheduledJob,
  type ReliableScheduledJobResult,
} from "../../jobs/reliableScheduler";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;

export type ManualJobControlErrorCode =
  | "invalid_job"
  | "invalid_idempotency_key"
  | "duplicate_trigger"
  | "concurrency_limited"
  | "retry_not_eligible"
  | "retry_not_due"
  | "retry_exhausted";

export class ManualJobControlError extends Error {
  constructor(
    message: string,
    readonly code: ManualJobControlErrorCode,
    readonly status: number,
  ) {
    super(message);
    this.name = "ManualJobControlError";
  }
}

export type ManualJobDefinition<T = unknown> = {
  name: string;
  agentName: string;
  inputSummary: string;
  reason: string;
  neededTools: string[];
  riskLevel?: 1 | 2 | 3 | 4;
  maxAttempts?: number;
  leaseSeconds?: number;
  retryDelayMs?: number;
  execute: (context: ToolExecutionContext) => Promise<T>;
};

export type ManualJobControlInput = {
  jobName: string;
  idempotencyKey: string;
  operatorId: string;
};

type ManualJobResult = ReliableScheduledJobResult<unknown>;

export function createManualJobController({
  repository,
  jobs,
}: {
  repository: ExecutionRepository;
  jobs: readonly ManualJobDefinition[];
}) {
  const jobsByName = new Map(jobs.map((job) => [job.name, job]));
  const activeTriggerKeys = new Set<string>();

  async function audit(
    input: ManualJobControlInput,
    action: "trigger" | "retry",
    eventType: string,
    outcome: "blocked" | "succeeded" | "failed",
    errorCode?: string,
  ) {
    await repository.recordAuditEvent({
      agentName: "operator_control",
      eventType,
      outcome,
      metadata: {
        jobName: input.jobName,
        operatorId: input.operatorId,
        action,
        errorCode: errorCode ?? null,
      },
    });
  }

  async function fail(
    input: ManualJobControlInput,
    action: "trigger" | "retry",
    code: ManualJobControlErrorCode,
    message: string,
    status: number,
  ): Promise<never> {
    await audit(input, action, "operator.job.rejected", "blocked", code);
    throw new ManualJobControlError(message, code, status);
  }

  async function resolveDefinition(input: ManualJobControlInput, action: "trigger" | "retry") {
    if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
      return fail(
        input,
        action,
        "invalid_idempotency_key",
        "idempotencyKey must contain 8 to 160 safe identifier characters",
        400,
      );
    }
    const definition = jobsByName.get(input.jobName);
    if (!definition) {
      return fail(input, action, "invalid_job", "The requested job is not eligible for manual control", 404);
    }
    return definition;
  }

  async function runDefinition(
    input: ManualJobControlInput,
    definition: ManualJobDefinition,
  ): Promise<ManualJobResult> {
    return runReliableScheduledJob({
      repository,
      jobName: definition.name,
      idempotencyKey: input.idempotencyKey,
      agentName: definition.agentName,
      inputSummary: definition.inputSummary,
      reason: definition.reason,
      neededTools: definition.neededTools,
      riskLevel: definition.riskLevel,
      leaseSeconds: definition.leaseSeconds,
      retry: {
        maxAttempts: definition.maxAttempts,
        retryDelayMs: definition.retryDelayMs,
      },
      execute: definition.execute,
    });
  }

  async function trigger(input: ManualJobControlInput): Promise<ManualJobResult> {
    const definition = await resolveDefinition(input, "trigger");
    if (activeTriggerKeys.has(input.idempotencyKey)) {
      return fail(input, "trigger", "duplicate_trigger", "This manual job delivery is already running", 409);
    }

    activeTriggerKeys.add(input.idempotencyKey);
    try {
      const result = await runDefinition(input, definition);
      if (result.outcome === "duplicate") {
        return fail(input, "trigger", "duplicate_trigger", "This manual job delivery has already been claimed", 409);
      }
      if (result.outcome === "concurrency_limited") {
        return fail(input, "trigger", "concurrency_limited", "Another delivery of this job currently holds the execution lease", 409);
      }
      await audit(input, "trigger", "operator.job.triggered", "succeeded");
      return result;
    } catch (error) {
      if (error instanceof ManualJobControlError) throw error;
      await audit(input, "trigger", "operator.job.failed", "failed", "job_execution_failed");
      throw error;
    } finally {
      activeTriggerKeys.delete(input.idempotencyKey);
    }
  }

  async function retry(input: ManualJobControlInput): Promise<ManualJobResult> {
    const definition = await resolveDefinition(input, "retry");
    const existing = (await repository.listScheduledJobs()).find((job) =>
      job.jobName === input.jobName && job.idempotencyKey === input.idempotencyKey,
    );

    if (!existing || existing.status !== "retry_scheduled" || !existing.retryable) {
      return fail(input, "retry", "retry_not_eligible", "Only retryable scheduled jobs can be retried", 409);
    }
    if (existing.attemptCount >= existing.maxAttempts) {
      return fail(input, "retry", "retry_exhausted", "The retry budget for this scheduled job is exhausted", 409);
    }
    if (activeTriggerKeys.has(input.idempotencyKey)) {
      return fail(input, "retry", "duplicate_trigger", "This scheduled job delivery is already running", 409);
    }

    activeTriggerKeys.add(input.idempotencyKey);
    try {
      const result = await runDefinition(input, definition);
      if (result.outcome === "duplicate") {
        if (result.job.status === "retry_scheduled") {
          return fail(input, "retry", "retry_not_due", "The scheduled retry backoff has not elapsed", 409);
        }
        return fail(input, "retry", "duplicate_trigger", "This scheduled job delivery has already been claimed", 409);
      }
      if (result.outcome === "concurrency_limited") {
        return fail(input, "retry", "concurrency_limited", "Another delivery of this job currently holds the execution lease", 409);
      }
      await audit(input, "retry", "operator.job.retried", "succeeded");
      return result;
    } catch (error) {
      if (error instanceof ManualJobControlError) throw error;
      await audit(input, "retry", "operator.job.failed", "failed", "job_execution_failed");
      throw error;
    } finally {
      activeTriggerKeys.delete(input.idempotencyKey);
    }
  }

  return {
    trigger,
    retry,
    eligibleJobs: () => [...jobsByName.keys()],
  };
}
