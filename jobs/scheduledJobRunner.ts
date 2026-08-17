import type { RiskLevel } from "../lib/execution/approval-engine";
import type { ExecutionRepository } from "../lib/execution/repository";

const DEFAULT_OWNER_ID = process.env.WORKER_ID ?? crypto.randomUUID();

export type ScheduledJobDefinition<Result> = {
  idempotencyKey?: string;
  leaseDurationMs?: number;
  ownerId?: string;
  retryClass?: "transient" | "permanent";
  agentName: string;
  provider: string;
  model: string;
  routeAgent: string;
  riskLevel: RiskLevel;
  inputSummary: string;
  reason: string;
  neededTools: string[];
  execute: (context: { runId: string }) => Promise<Result>;
  summarize: (result: Result) => string;
};

export type ScheduledJobResult<Result> = {
  runId: string;
  duplicate: boolean;
  skippedReason?: "duplicate" | "lease_contended";
  data?: Result;
};

export async function runScheduledJob<Result>(
  repository: ExecutionRepository,
  definition: ScheduledJobDefinition<Result>,
): Promise<ScheduledJobResult<Result>> {
  const startedAt = Date.now();
  const leaseKey = definition.idempotencyKey
    ? `scheduled-job:${definition.idempotencyKey}`
    : `scheduled-job:${definition.agentName}`;
  const ownerId = definition.ownerId ?? DEFAULT_OWNER_ID;
  const lease = await repository.acquireJobLease({
    leaseKey,
    ownerId,
    leaseDurationMs: definition.leaseDurationMs ?? 60_000,
  });
  if (!lease) {
    await repository.recordAuditEvent({
      agentName: definition.agentName,
      eventType: "scheduled_job.lease_contended",
      outcome: "blocked",
      metadata: { leaseKey },
    });
    return { runId: "", duplicate: true, skippedReason: "lease_contended" };
  }
  if (definition.idempotencyKey) {
    const existingRun = await repository.findAgentRunByIdempotencyKey(definition.idempotencyKey);
    if (existingRun) {
      await repository.recordAuditEvent({
        runId: existingRun.id,
        agentName: definition.agentName,
        eventType: "scheduled_job.duplicate",
        outcome: "blocked",
        metadata: { idempotencyKey: definition.idempotencyKey },
      });
      await repository.releaseJobLease({ leaseKey, ownerId });
      return { runId: existingRun.id, duplicate: true, skippedReason: "duplicate" };
    }
  }
  const run = await repository.createAgentRun({
    agentName: definition.agentName,
    provider: definition.provider,
    model: definition.model,
    routeAgent: definition.routeAgent,
    riskLevel: definition.riskLevel,
    inputSummary: definition.inputSummary,
    idempotencyKey: definition.idempotencyKey,
  });

  await repository.recordRoutingDecision({
    runId: run.id,
    selectedAgent: definition.routeAgent,
    riskLevel: definition.riskLevel,
    reason: definition.reason,
    neededTools: definition.neededTools,
    approvalRequired: definition.riskLevel >= 3,
  });

  try {
    const data = await definition.execute({ runId: run.id });
    await repository.completeAgentRun({
      runId: run.id,
      status: "completed",
      outputSummary: definition.summarize(data),
      durationMs: Date.now() - startedAt,
    });
    await repository.recordAuditEvent({
      runId: run.id,
      agentName: definition.agentName,
      eventType: "scheduled_job.completed",
      outcome: "succeeded",
      metadata: { durationMs: Date.now() - startedAt },
    });
    await repository.releaseJobLease({ leaseKey, ownerId });
    return { runId: run.id, duplicate: false, data };
  } catch (error) {
    const retryable = definition.retryClass === "transient";
    const errorCode = retryable ? "scheduled_job_retryable" : "scheduled_job_failed";
    await repository.completeAgentRun({
      runId: run.id,
      status: "failed",
      errorCode,
      durationMs: Date.now() - startedAt,
    });
    await repository.recordAuditEvent({
      runId: run.id,
      agentName: definition.agentName,
      eventType: "scheduled_job.failed",
      outcome: "failed",
      metadata: { errorCode, retryClass: definition.retryClass ?? "permanent" },
    });
    await repository.releaseJobLease({ leaseKey, ownerId });
    throw error;
  }
}
