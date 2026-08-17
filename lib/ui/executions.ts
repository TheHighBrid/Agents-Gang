export type ExecutionHealthInput = {
  runs: Array<{ status: string }>;
  toolCalls: Array<{ outcome: string }>;
  approvals: Array<{ status: string }>;
};

export type ExecutionHealth = {
  totalRuns: number;
  activeRuns: number;
  failedRuns: number;
  successfulToolCalls: number;
  blockedToolCalls: number;
  pendingApprovals: number;
};

export function summarizeExecutionHealth(input: ExecutionHealthInput): ExecutionHealth {
  return {
    totalRuns: input.runs.length,
    activeRuns: input.runs.filter((run) => run.status === "running").length,
    failedRuns: input.runs.filter((run) => run.status === "failed").length,
    successfulToolCalls: input.toolCalls.filter((call) => call.outcome === "succeeded").length,
    blockedToolCalls: input.toolCalls.filter((call) => call.outcome === "blocked").length,
    pendingApprovals: input.approvals.filter((approval) => approval.status === "pending").length,
  };
}

export function getNewestFirst<T extends { createdAt: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}
