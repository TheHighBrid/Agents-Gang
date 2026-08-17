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
  listApprovals(): Promise<ApprovalRecord[]>;
  decideApproval(input: ApprovalDecisionInput): Promise<ApprovalRecord>;
  createAgentRun(input: CreateAgentRunInput): Promise<AgentRunRecord>;
  completeAgentRun(input: CompleteAgentRunInput): Promise<AgentRunRecord>;
  recordRoutingDecision(input: RecordRoutingDecisionInput): Promise<RoutingDecisionRecord>;
  recordAuditEvent(input: RecordAuditEventInput): Promise<AuditEventRecord>;
  recordToolCall(input: RecordToolCallInput): Promise<ToolCallRecord>;
  listAgentRuns(): Promise<AgentRunRecord[]>;
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
      return [...approvals.values()];
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
  };
}
