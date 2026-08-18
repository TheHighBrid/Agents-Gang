import type {
  AgentRunRecord,
  AuditEventRecord,
  ScheduledJobRecord,
  ToolCallRecord,
} from "../execution/repository";

type HealthScheduledJob = Pick<ScheduledJobRecord, "status" | "updatedAt">;
type HealthAgentRun = Pick<AgentRunRecord, "status" | "errorCode" | "createdAt">;
type HealthToolCall = Pick<ToolCallRecord, "outcome" | "errorCode" | "createdAt">;
type HealthAuditEvent = Pick<AuditEventRecord, "outcome" | "metadata" | "createdAt">;

export type OperationalMetricSnapshot = {
  failedJobs: number;
  providerTimeouts: number;
  persistenceTimeouts: number;
  blockedActions: number;
};

export type OperationalAlert = {
  code: "failed_jobs" | "provider_timeouts" | "persistence_timeouts" | "repeated_blocks";
  severity: "warning" | "critical";
  count: number;
  threshold: number;
  owner: "manus" | "sol-5.6";
  nextAction: string;
};

export type OperationalHealthSnapshot = {
  windowMinutes: number;
  metrics: OperationalMetricSnapshot;
  alerts: OperationalAlert[];
};

const DEFAULT_WINDOW_MINUTES = 15;

export function evaluateOperationalHealth({
  scheduledJobs,
  agentRuns,
  toolCalls,
  auditEvents,
  now = new Date(),
  windowMinutes = DEFAULT_WINDOW_MINUTES,
}: {
  scheduledJobs: readonly HealthScheduledJob[];
  agentRuns: readonly HealthAgentRun[];
  toolCalls: readonly HealthToolCall[];
  auditEvents: readonly HealthAuditEvent[];
  now?: Date;
  windowMinutes?: number;
}): OperationalHealthSnapshot {
  const windowStart = now.getTime() - windowMinutes * 60_000;
  const recent = (timestamp: string) => {
    const value = new Date(timestamp).getTime();
    return Number.isFinite(value) && value >= windowStart && value <= now.getTime();
  };

  const failedJobs = scheduledJobs.filter((job) => job.status === "failed" && recent(job.updatedAt)).length;
  const providerTimeouts =
    toolCalls.filter((call) => recent(call.createdAt) && isProviderTimeout(call.errorCode)).length +
    agentRuns.filter((run) => recent(run.createdAt) && isProviderTimeout(run.errorCode)).length;
  const persistenceTimeouts = auditEvents.filter((event) =>
    event.outcome === "failed" &&
    recent(event.createdAt) &&
    isPersistenceTimeout(event.metadata.errorCode),
  ).length;
  const blockedActions = toolCalls.filter((call) => call.outcome === "blocked" && recent(call.createdAt)).length;

  const metrics: OperationalMetricSnapshot = {
    failedJobs,
    providerTimeouts,
    persistenceTimeouts,
    blockedActions,
  };
  const alerts: OperationalAlert[] = [];

  if (failedJobs >= 1) {
    alerts.push({
      code: "failed_jobs",
      severity: "critical",
      count: failedJobs,
      threshold: 1,
      owner: "manus",
      nextAction: "Inspect the latest failed scheduled job and its correlation trail before retrying.",
    });
  }
  if (providerTimeouts >= 3) {
    alerts.push({
      code: "provider_timeouts",
      severity: "warning",
      count: providerTimeouts,
      threshold: 3,
      owner: "manus",
      nextAction: "Check provider availability and retry only through the governed scheduler policy.",
    });
  }
  if (persistenceTimeouts >= 1) {
    alerts.push({
      code: "persistence_timeouts",
      severity: "critical",
      count: persistenceTimeouts,
      threshold: 1,
      owner: "manus",
      nextAction: "Verify execution persistence health before allowing additional mutating work.",
    });
  }
  if (blockedActions >= 3) {
    alerts.push({
      code: "repeated_blocks",
      severity: "warning",
      count: blockedActions,
      threshold: 3,
      owner: "sol-5.6",
      nextAction: "Surface the repeated policy blocks in the founder dashboard and review the requested action path.",
    });
  }

  return { windowMinutes, metrics, alerts };
}

function isProviderTimeout(errorCode: string | undefined) {
  return Boolean(errorCode && errorCode.endsWith("_timeout") && !errorCode.includes("persistence"));
}

function isPersistenceTimeout(value: unknown) {
  return typeof value === "string" && value.includes("persistence") && value.includes("timeout");
}
