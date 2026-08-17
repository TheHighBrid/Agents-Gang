import { timingSafeEqual } from "node:crypto";

import type { ExecutionRepository } from "../execution/repository";

const OPERATOR_ROLE = "operator";
const MAX_RETRY_ATTEMPTS = 3;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;

export class ManualJobControlError extends Error {
  constructor(
    message: string,
    readonly code:
      | "operator_controls_not_configured"
      | "unauthorized_operator"
      | "invalid_job"
      | "invalid_idempotency_key"
      | "duplicate_trigger"
      | "retry_not_eligible"
      | "retry_exhausted",
    readonly status: number,
  ) {
    super(message);
    this.name = "ManualJobControlError";
  }
}

export type OperatorIdentity = {
  id: string;
  role: "operator";
};

export type ManualJobDefinition = {
  name: string;
  run(input: {
    repository: ExecutionRepository;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ runId: string; duplicate: boolean; skippedReason?: "duplicate" | "lease_contended" }>;
};

export type ManualJobControlInput = {
  jobName: string;
  idempotencyKey: string;
  operatorId: string;
  correlationId: string;
};

function hasMatchingCredential(provided: string, expected: string) {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

function safeOperatorId(request: Request) {
  const supplied = request.headers.get("x-operator-id")?.trim();
  return supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : "operator";
}

export function authorizeOperatorRequest(
  request: Request,
  env: { OPERATOR_CONTROL_TOKEN?: string },
): OperatorIdentity {
  const configuredToken = env.OPERATOR_CONTROL_TOKEN;
  if (!configuredToken) {
    throw new ManualJobControlError(
      "Operator controls are not configured",
      "operator_controls_not_configured",
      503,
    );
  }

  const role = request.headers.get("x-operator-role");
  const authorization = request.headers.get("authorization");
  const suppliedToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (role !== OPERATOR_ROLE || !hasMatchingCredential(suppliedToken, configuredToken)) {
    throw new ManualJobControlError("Operator authorization is required", "unauthorized_operator", 403);
  }

  return { id: safeOperatorId(request), role: OPERATOR_ROLE };
}

function ensureIdempotencyKey(idempotencyKey: string) {
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new ManualJobControlError(
      "idempotencyKey must contain 8 to 160 safe identifier characters",
      "invalid_idempotency_key",
      400,
    );
  }
}

export function createManualJobController({
  repository,
  jobs,
  maxRetryAttempts = MAX_RETRY_ATTEMPTS,
}: {
  repository: ExecutionRepository;
  jobs: ManualJobDefinition[];
  maxRetryAttempts?: number;
}) {
  const jobsByName = new Map(jobs.map((job) => [job.name, job]));
  const activeTriggerKeys = new Set<string>();

  async function resolveJob(input: ManualJobControlInput) {
    ensureIdempotencyKey(input.idempotencyKey);
    const job = jobsByName.get(input.jobName);
    if (!job) {
      await repository.recordAuditEvent({
        agentName: "operator_control",
        correlationId: input.correlationId,
        eventType: "operator_control.invalid_job",
        outcome: "blocked",
        metadata: { jobName: input.jobName, operatorId: input.operatorId },
      });
      throw new ManualJobControlError("The requested job is not eligible for manual control", "invalid_job", 404);
    }
    return job;
  }

  async function trigger(input: ManualJobControlInput) {
    const job = await resolveJob(input);
    const existing = await repository.findAgentRunByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      await repository.recordAuditEvent({
        runId: existing.id,
        agentName: "operator_control",
        correlationId: input.correlationId,
        eventType: "operator_control.duplicate",
        outcome: "blocked",
        metadata: { jobName: input.jobName, action: "trigger" },
      });
      return { jobName: input.jobName, runId: existing.id, duplicate: true, skippedReason: "duplicate" as const };
    }

    if (activeTriggerKeys.has(input.idempotencyKey)) {
      await repository.recordAuditEvent({
        agentName: "operator_control",
        correlationId: input.correlationId,
        eventType: "operator_control.duplicate",
        outcome: "blocked",
        metadata: { jobName: input.jobName, action: "trigger" },
      });
      return { jobName: input.jobName, runId: "", duplicate: true, skippedReason: "duplicate" as const };
    }

    activeTriggerKeys.add(input.idempotencyKey);
    try {
      const result = await job.run({
        repository,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
      });
      await repository.recordAuditEvent({
        runId: result.runId || undefined,
        agentName: "operator_control",
        correlationId: input.correlationId,
        eventType: "operator_control.triggered",
        outcome: result.duplicate ? "blocked" : "succeeded",
        metadata: { jobName: input.jobName, action: "trigger" },
      });
      return { jobName: input.jobName, ...result };
    } finally {
      activeTriggerKeys.delete(input.idempotencyKey);
    }
  }

  async function retry(input: ManualJobControlInput & { failedRunId: string }) {
    const failedRun = (await repository.listAgentRuns()).find((run) => run.id === input.failedRunId);
    if (failedRun?.status !== "failed" || failedRun.errorCode !== "scheduled_job_retryable") {
      await repository.recordAuditEvent({
        runId: input.failedRunId,
        agentName: "operator_control",
        correlationId: input.correlationId,
        eventType: "operator_control.retry_ineligible",
        outcome: "blocked",
        metadata: { jobName: input.jobName, action: "retry" },
      });
      throw new ManualJobControlError("Only retryable failed runs can be retried", "retry_not_eligible", 409);
    }

    const retryPrefix = `retry:${input.failedRunId}:`;
    const attempts = (await repository.listAgentRuns()).filter((run) => run.idempotencyKey?.startsWith(retryPrefix)).length;
    if (attempts >= maxRetryAttempts) {
      await repository.recordAuditEvent({
        runId: failedRun.id,
        agentName: "operator_control",
        correlationId: input.correlationId,
        eventType: "operator_control.retry_exhausted",
        outcome: "blocked",
        metadata: { jobName: input.jobName, action: "retry", retryAttempts: attempts },
      });
      throw new ManualJobControlError("The retry budget for this run is exhausted", "retry_exhausted", 409);
    }

    const result = await trigger({
      ...input,
      idempotencyKey: `${retryPrefix}${input.idempotencyKey}`,
    });
    await repository.recordAuditEvent({
      runId: result.runId || undefined,
      agentName: "operator_control",
      correlationId: input.correlationId,
      eventType: "operator_control.retried",
      outcome: result.duplicate ? "blocked" : "succeeded",
      metadata: { jobName: input.jobName, action: "retry", failedRunId: input.failedRunId },
    });
    return result;
  }

  return { trigger, retry, eligibleJobs: () => [...jobsByName.keys()] };
}
