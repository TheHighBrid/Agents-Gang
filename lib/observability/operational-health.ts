export type OperationalRecord = {
  id: string;
  status?: string;
  outcome?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
};

export type OperationalMetrics = {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  retryableFailedRuns: number;
  providerTimeouts: number;
  persistenceTimeouts: number;
  blockedEvents: number;
};

export type OperationalAlert = {
  key: "failed_jobs" | "provider_timeouts" | "persistence_timeouts" | "repeated_blocks";
  severity: "warning" | "critical";
  count: number;
  threshold: number;
  owner: "operations" | "integrations" | "platform" | "governance";
  message: string;
};

export type OperationalThresholds = {
  failedJobs: { warning: number; critical: number };
  providerTimeouts: { warning: number; critical: number };
  persistenceTimeouts: { warning: number; critical: number };
  repeatedBlocks: { warning: number; critical: number };
};

export const DEFAULT_OPERATIONAL_THRESHOLDS: OperationalThresholds = {
  failedJobs: { warning: 3, critical: 5 },
  providerTimeouts: { warning: 3, critical: 5 },
  persistenceTimeouts: { warning: 2, critical: 3 },
  repeatedBlocks: { warning: 5, critical: 10 },
};

type OperationalHealthInput = {
  runs: OperationalRecord[];
  auditEvents: OperationalRecord[];
  toolCalls: OperationalRecord[];
};

function countMatching(records: OperationalRecord[], predicate: (record: OperationalRecord) => boolean) {
  return records.reduce((count, record) => count + (predicate(record) ? 1 : 0), 0);
}

function makeAlert(
  key: OperationalAlert["key"],
  count: number,
  thresholds: { warning: number; critical: number },
  owner: OperationalAlert["owner"],
  label: string,
): OperationalAlert | undefined {
  if (count >= thresholds.critical) {
    return {
      key,
      severity: "critical",
      count,
      threshold: thresholds.critical,
      owner,
      message: `${label} reached the critical threshold.`,
    };
  }
  if (count >= thresholds.warning) {
    return {
      key,
      severity: "warning",
      count,
      threshold: thresholds.warning,
      owner,
      message: `${label} reached the warning threshold.`,
    };
  }
  return undefined;
}

export function summarizeOperationalHealth(
  { runs, auditEvents, toolCalls }: OperationalHealthInput,
  thresholds: OperationalThresholds = DEFAULT_OPERATIONAL_THRESHOLDS,
) {
  const metrics: OperationalMetrics = {
    totalRuns: runs.length,
    completedRuns: countMatching(runs, (run) => run.status === "completed"),
    failedRuns: countMatching(runs, (run) => run.status === "failed"),
    runningRuns: countMatching(runs, (run) => run.status === "running"),
    retryableFailedRuns: countMatching(runs, (run) => run.errorCode === "scheduled_job_retryable"),
    providerTimeouts: countMatching(toolCalls, (call) => call.errorCode === "provider_timeout"),
    persistenceTimeouts: countMatching(toolCalls, (call) => call.errorCode === "execution_persistence_timeout"),
    blockedEvents: countMatching(auditEvents, (event) => event.outcome === "blocked"),
  };

  const alerts = [
    makeAlert("failed_jobs", metrics.failedRuns, thresholds.failedJobs, "operations", "Failed jobs"),
    makeAlert("provider_timeouts", metrics.providerTimeouts, thresholds.providerTimeouts, "integrations", "Provider timeouts"),
    makeAlert("persistence_timeouts", metrics.persistenceTimeouts, thresholds.persistenceTimeouts, "platform", "Persistence timeouts"),
    makeAlert("repeated_blocks", metrics.blockedEvents, thresholds.repeatedBlocks, "governance", "Repeated blocked actions"),
  ].filter((alert): alert is OperationalAlert => Boolean(alert));

  return { metrics, alerts };
}
