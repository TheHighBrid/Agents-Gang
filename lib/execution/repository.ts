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

export type JobLeaseRecord = {
  leaseKey: string;
  ownerId: string;
  acquiredAt: string;
  expiresAt: string;
};

export type AcquireJobLeaseInput = {
  leaseKey: string;
  ownerId: string;
  leaseDurationMs: number;
};

export type ReleaseJobLeaseInput = {
  leaseKey: string;
  ownerId: string;
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
  idempotencyKey?: string;
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
  createAgentRun(input: CreateAgentRunInput): Promise<AgentRunRecord>;
  completeAgentRun(input: CompleteAgentRunInput): Promise<AgentRunRecord>;
  recordRoutingDecision(input: RecordRoutingDecisionInput): Promise<RoutingDecisionRecord>;
  recordAuditEvent(input: RecordAuditEventInput): Promise<AuditEventRecord>;
  recordToolCall(input: RecordToolCallInput): Promise<ToolCallRecord>;
  listApprovals(): Promise<ApprovalRecord[]>;
  listAgentRuns(): Promise<AgentRunRecord[]>;
  findAgentRunByIdempotencyKey(idempotencyKey: string): Promise<AgentRunRecord | undefined>;
  acquireJobLease(input: AcquireJobLeaseInput): Promise<JobLeaseRecord | undefined>;
  releaseJobLease(input: ReleaseJobLeaseInput): Promise<boolean>;
  listRoutingDecisions(): Promise<RoutingDecisionRecord[]>;
  listAuditEvents(): Promise<AuditEventRecord[]>;
  listToolCalls(): Promise<ToolCallRecord[]>;
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
  const jobLeases = new Map<string, JobLeaseRecord>();
  const newestFirst = <T extends { createdAt: string }>(records: T[]) =>
    [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

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

    async listApprovals() {
      return [...approvals.values()].sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
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
    async findAgentRunByIdempotencyKey(idempotencyKey) {
      return [...agentRuns.values()].find((run) => run.idempotencyKey === idempotencyKey);
    },
    async acquireJobLease(input) {
      if (!Number.isInteger(input.leaseDurationMs) || input.leaseDurationMs <= 0) {
        throw new Error("Lease duration must be a positive integer");
      }
      const now = clock();
      const existing = jobLeases.get(input.leaseKey);
      if (existing && new Date(existing.expiresAt).getTime() > now.getTime()) {
        return undefined;
      }
      const lease = {
        leaseKey: input.leaseKey,
        ownerId: input.ownerId,
        acquiredAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + input.leaseDurationMs).toISOString(),
      };
      jobLeases.set(input.leaseKey, lease);
      return lease;
    },
    async releaseJobLease(input) {
      const existing = jobLeases.get(input.leaseKey);
      if (!existing || existing.ownerId !== input.ownerId) {
        return false;
      }
      jobLeases.delete(input.leaseKey);
      return true;
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
      return newestFirst([...agentRuns.values()].map((run) => ({ ...run, createdAt: run.createdAt })));
    },

    async listRoutingDecisions() {
      return newestFirst(routingDecisions);
    },

    async listAuditEvents() {
      return newestFirst(auditEvents);
    },

    async listToolCalls() {
      return newestFirst(toolCalls);
    },
  };
}
