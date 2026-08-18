import type { ApprovalStatus, RiskLevel } from "./approval-engine";

export type ApprovalRecord = {
  id: string;
  requestingAgent: string;
  actionType: string;
  target: {
    type: string;
    id: string;
  };
  riskLevel: RiskLevel;
  payloadSummary: string;
  status: ApprovalStatus;
  requestedAt: string;
  updatedAt: string;
  decidedAt?: string;
  expiresAt?: string;
  result?: string;
};

export type CreateApprovalInput = Omit<
  ApprovalRecord,
  "id" | "status" | "requestedAt" | "updatedAt" | "decidedAt" | "expiresAt" | "result"
>;

export type ApprovalDecisionInput = {
  approvalId: string;
  status: Extract<ApprovalStatus, "approved" | "rejected">;
  result: string;
};

export type ApprovalQuery = {
  status?: ApprovalStatus;
  actionType?: string;
  requestedFrom?: string;
  requestedTo?: string;
  cursor?: string;
  limit?: number;
};

export type ApprovalPage = {
  approvals: ApprovalRecord[];
  nextCursor?: string;
};

export type AgentRunStatus = "running" | "completed" | "failed" | "blocked";

export type AgentRunRecord = {
  id: string;
  agentName: string;
  provider: string;
  model: string;
  routeAgent: string;
  riskLevel: RiskLevel;
  status: AgentRunStatus;
  createdAt: string;
  completedAt?: string;
  inputSummary?: string;
  outputSummary?: string;
  errorCode?: string;
  durationMs?: number;
};

export type CreateAgentRunInput = Omit<
  AgentRunRecord,
  "id" | "status" | "createdAt" | "completedAt" | "outputSummary" | "errorCode" | "durationMs"
>;

export type CompleteAgentRunInput = {
  runId: string;
  status: Exclude<AgentRunStatus, "running">;
  outputSummary?: string;
  errorCode?: string;
  durationMs?: number;
};

export type ScheduledJobStatus = "running" | "retry_scheduled" | "completed" | "failed";

export type ScheduledJobRecord = {
  id: string;
  jobName: string;
  idempotencyKey: string;
  agentName: string;
  status: ScheduledJobStatus;
  attemptCount: number;
  maxAttempts: number;
  retryable: boolean;
  lastErrorCode?: string;
  leaseExpiresAt?: string;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type ClaimScheduledJobInput = {
  jobName: string;
  idempotencyKey: string;
  agentName: string;
  maxAttempts: number;
  leaseSeconds: number;
};

export type ScheduledJobClaim = {
  claimed: boolean;
  reason?: "duplicate" | "concurrency_limited";
  job: ScheduledJobRecord;
};

export type CompleteScheduledJobInput = {
  jobId: string;
  status: Exclude<ScheduledJobStatus, "running">;
  retryable: boolean;
  lastErrorCode?: string;
  nextRetryAt?: string;
};

export type RoutingDecisionRecord = {
  id: string;
  runId: string;
  selectedAgent: string;
  riskLevel: RiskLevel;
  reason: string;
  neededTools: string[];
  approvalRequired: boolean;
  createdAt: string;
};

export type RecordRoutingDecisionInput = Omit<RoutingDecisionRecord, "id" | "createdAt">;

export type AuditEventRecord = {
  id: string;
  runId?: string;
  agentName?: string;
  toolName?: string;
  riskLevel?: RiskLevel;
  approvalId?: string;
  eventType: string;
  outcome: "blocked" | "succeeded" | "failed";
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type RecordAuditEventInput = Omit<AuditEventRecord, "id" | "createdAt">;

export type ToolCallRecord = {
  id: string;
  runId: string;
  agentName: string;
  toolName: string;
  capability: "read" | "draft" | "prepare" | "execute";
  riskLevel: RiskLevel;
  approvalId?: string;
  outcome: "blocked" | "succeeded" | "failed";
  errorCode?: string;
  createdAt: string;
};

export type RecordToolCallInput = Omit<ToolCallRecord, "id" | "createdAt">;

export type ExecutionRepository = {
  createApproval(input: CreateApprovalInput): Promise<ApprovalRecord>;
  getApproval(approvalId: string): Promise<ApprovalRecord | undefined>;
  decideApproval(input: ApprovalDecisionInput): Promise<ApprovalRecord>;
  consumeApproval(approvalId: string): Promise<ApprovalRecord>;
  listApprovals(): Promise<ApprovalRecord[]>;
  queryApprovals(query: ApprovalQuery): Promise<ApprovalPage>;
  createAgentRun(input: CreateAgentRunInput): Promise<AgentRunRecord>;
  completeAgentRun(input: CompleteAgentRunInput): Promise<AgentRunRecord>;
  claimScheduledJob(input: ClaimScheduledJobInput): Promise<ScheduledJobClaim>;
  completeScheduledJob(input: CompleteScheduledJobInput): Promise<ScheduledJobRecord>;
  recordRoutingDecision(input: RecordRoutingDecisionInput): Promise<RoutingDecisionRecord>;
  recordAuditEvent(input: RecordAuditEventInput): Promise<AuditEventRecord>;
  recordToolCall(input: RecordToolCallInput): Promise<ToolCallRecord>;
  listAgentRuns(): Promise<AgentRunRecord[]>;
  listRoutingDecisions(): Promise<RoutingDecisionRecord[]>;
  listAuditEvents(): Promise<AuditEventRecord[]>;
  listToolCalls(): Promise<ToolCallRecord[]>;
  listScheduledJobs(): Promise<ScheduledJobRecord[]>;
};

export function createInMemoryExecutionRepository({
  clock = () => new Date(),
  idFactory = () => crypto.randomUUID(),
}: {
  clock?: () => Date;
  idFactory?: () => string;
} = {}): ExecutionRepository {
  const approvals = new Map<string, ApprovalRecord>();
  const agentRuns = new Map<string, AgentRunRecord>();
  const routingDecisions: RoutingDecisionRecord[] = [];
  const auditEvents: AuditEventRecord[] = [];
  const toolCalls: ToolCallRecord[] = [];
  const scheduledJobs = new Map<string, ScheduledJobRecord>();

  return {
    async createApproval(input) {
      const timestamp = clock().toISOString();
      const approval = {
        ...input,
        id: idFactory(),
        status: "pending" as const,
        requestedAt: timestamp,
        updatedAt: timestamp,
      };
      approvals.set(approval.id, approval);
      return approval;
    },

    async getApproval(approvalId) {
      return approvals.get(approvalId);
    },

    async decideApproval(input) {
      const approval = approvals.get(input.approvalId);
      if (!approval) {
        throw new Error(`Approval request not found: ${input.approvalId}`);
      }

      if (approval.status !== "pending") {
        throw new Error(`Approval request is already ${approval.status}`);
      }

      const timestamp = clock().toISOString();
      const decided = {
        ...approval,
        status: input.status,
        result: input.result,
        decidedAt: timestamp,
        updatedAt: timestamp,
      };
      approvals.set(decided.id, decided);
      return decided;
    },

    async consumeApproval(approvalId) {
      const approval = approvals.get(approvalId);
      if (!approval || approval.status !== "approved") throw new Error("Approval request is not executable");
      const timestamp = clock().toISOString();
      const consumed = { ...approval, status: "consumed" as const, updatedAt: timestamp };
      approvals.set(approvalId, consumed);
      return consumed;
    },

    async listApprovals() {
      return [...approvals.values()].sort((left, right) =>
        right.requestedAt.localeCompare(left.requestedAt),
      );
    },

    async queryApprovals(query) {
      const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
      const cursor = query.cursor ? decodeApprovalCursor(query.cursor) : undefined;
      const requestedFrom = query.requestedFrom ? new Date(query.requestedFrom).getTime() : undefined;
      const requestedTo = query.requestedTo ? new Date(query.requestedTo).getTime() : undefined;
      const filtered = [...approvals.values()]
        .filter((approval) => !query.status || approval.status === query.status)
        .filter((approval) => !query.actionType || approval.actionType === query.actionType)
        .filter((approval) => requestedFrom === undefined || new Date(approval.requestedAt).getTime() >= requestedFrom)
        .filter((approval) => requestedTo === undefined || new Date(approval.requestedAt).getTime() <= requestedTo)
        .filter((approval) => !cursor || compareApprovalOrder(approval, cursor) > 0)
        .sort(compareApprovals);
      const page = filtered.slice(0, limit);
      return {
        approvals: page,
        nextCursor: filtered.length > limit && page.length ? encodeApprovalCursor(page[page.length - 1]!) : undefined,
      };
    },

    async createAgentRun(input) {
      const run = {
        ...input,
        id: idFactory(),
        status: "running" as const,
        createdAt: clock().toISOString(),
      };
      agentRuns.set(run.id, run);
      return run;
    },

    async completeAgentRun(input) {
      const run = agentRuns.get(input.runId);
      if (!run) {
        throw new Error(`Agent run not found: ${input.runId}`);
      }
      if (run.status !== "running") {
        throw new Error(`Agent run is already ${run.status}`);
      }

      const completedAt = clock().toISOString();
      const completed = {
        ...run,
        status: input.status,
        completedAt,
        outputSummary: input.outputSummary,
        errorCode: input.errorCode,
        durationMs: input.durationMs,
      };
      agentRuns.set(completed.id, completed);
      return completed;
    },

    async claimScheduledJob(input) {
      const now = clock();
      const timestamp = now.toISOString();
      const leaseExpiresAt = new Date(now.getTime() + input.leaseSeconds * 1_000).toISOString();
      const existing = scheduledJobs.get(input.idempotencyKey);
      if (!existing) {
        const activeJob = [...scheduledJobs.values()].find((candidate) =>
          candidate.jobName === input.jobName
          && candidate.status === "running"
          && candidate.leaseExpiresAt
          && new Date(candidate.leaseExpiresAt).getTime() > now.getTime(),
        );
        if (activeJob) return { claimed: false, reason: "concurrency_limited", job: activeJob };
        const job: ScheduledJobRecord = {
          id: idFactory(),
          jobName: input.jobName,
          idempotencyKey: input.idempotencyKey,
          agentName: input.agentName,
          status: "running",
          attemptCount: 1,
          maxAttempts: input.maxAttempts,
          retryable: false,
          leaseExpiresAt,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        scheduledJobs.set(job.idempotencyKey, job);
        return { claimed: true, job };
      }
      const leaseExpired = !existing.leaseExpiresAt || new Date(existing.leaseExpiresAt).getTime() <= now.getTime();
      const retryDue = existing.status === "retry_scheduled" && (!existing.nextRetryAt || new Date(existing.nextRetryAt).getTime() <= now.getTime());
      const reclaimExpiredLease = existing.status === "running" && leaseExpired;
      if ((!retryDue && !reclaimExpiredLease) || existing.attemptCount >= existing.maxAttempts) {
        return { claimed: false, reason: "duplicate", job: existing };
      }
      const job: ScheduledJobRecord = {
        ...existing,
        status: "running",
        attemptCount: existing.attemptCount + 1,
        retryable: false,
        leaseExpiresAt,
        nextRetryAt: undefined,
        updatedAt: timestamp,
      };
      scheduledJobs.set(job.idempotencyKey, job);
      return { claimed: true, job };
    },

    async completeScheduledJob(input) {
      const job = [...scheduledJobs.values()].find((candidate) => candidate.id === input.jobId);
      if (!job || job.status !== "running") throw new Error("Scheduled job is not running");
      const timestamp = clock().toISOString();
      const completed: ScheduledJobRecord = {
        ...job,
        status: input.status,
        retryable: input.retryable,
        lastErrorCode: input.lastErrorCode ?? job.lastErrorCode,
        nextRetryAt: input.nextRetryAt,
        leaseExpiresAt: undefined,
        updatedAt: timestamp,
        completedAt: input.status === "completed" || input.status === "failed" ? timestamp : undefined,
      };
      scheduledJobs.set(completed.idempotencyKey, completed);
      return completed;
    },

    async recordRoutingDecision(input) {
      const decision = {
        ...input,
        id: idFactory(),
        createdAt: clock().toISOString(),
      };
      routingDecisions.push(decision);
      return decision;
    },

    async recordAuditEvent(input) {
      const event = {
        ...input,
        id: idFactory(),
        createdAt: clock().toISOString(),
      };
      auditEvents.push(event);
      return event;
    },

    async recordToolCall(input) {
      const toolCall = {
        ...input,
        id: idFactory(),
        createdAt: clock().toISOString(),
      };
      toolCalls.push(toolCall);
      return toolCall;
    },

    async listAgentRuns() {
      return [...agentRuns.values()];
    },

    async listRoutingDecisions() {
      return [...routingDecisions];
    },

    async listAuditEvents() {
      return [...auditEvents];
    },

    async listToolCalls() {
      return [...toolCalls];
    },

    async listScheduledJobs() {
      return [...scheduledJobs.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },
  };
}

function compareApprovals(left: ApprovalRecord, right: ApprovalRecord) {
  return right.requestedAt.localeCompare(left.requestedAt) || right.id.localeCompare(left.id);
}

type ApprovalCursor = Pick<ApprovalRecord, "requestedAt" | "id">;

function compareApprovalOrder(approval: ApprovalRecord, cursor: ApprovalCursor) {
  return cursor.requestedAt.localeCompare(approval.requestedAt) || cursor.id.localeCompare(approval.id);
}

export function encodeApprovalCursor(approval: ApprovalCursor) {
  return Buffer.from(JSON.stringify(approval), "utf8").toString("base64url");
}

export function decodeApprovalCursor(cursor: string): ApprovalCursor {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new Error("Approval cursor is invalid");
  }
  if (!value || typeof value !== "object" || typeof (value as ApprovalCursor).requestedAt !== "string" || typeof (value as ApprovalCursor).id !== "string") {
    throw new Error("Approval cursor is invalid");
  }
  return value as ApprovalCursor;
}
