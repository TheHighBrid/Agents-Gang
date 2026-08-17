import type {
  AcquireJobLeaseInput,
  AgentRunRecord,
  AuditEventRecord,
  ApprovalDecisionInput,
  ApprovalRecord,
  CompleteAgentRunInput,
  CreateAgentRunInput,
  CreateApprovalInput,
  ExecutionRepository,
  RecordAuditEventInput,
  RecordRoutingDecisionInput,
  RecordToolCallInput,
  ReleaseJobLeaseInput,
  JobLeaseRecord,
  RoutingDecisionRecord,
  ToolCallRecord,
} from "./repository";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type SupabaseExecutionRepositoryOptions = {
  url: string;
  serviceRoleKey: string;
  request?: FetchLike;
};

type SupabaseApprovalRow = {
  id: string;
  agent_name: string;
  action_type: string;
  target_type: string;
  target_id: string;
  risk_level: ApprovalRecord["riskLevel"];
  payload_summary: string;
  status: ApprovalRecord["status"];
  created_at: string;
  updated_at: string;
  decided_at?: string | null;
  result?: string | null;
  expires_at?: string | null;
};

type SupabaseAgentRunRow = {
  id: string;
  agent_name: string;
  provider: string;
  model: string;
  route_agent: string;
  risk_level: AgentRunRecord["riskLevel"];
  status: AgentRunRecord["status"];
  created_at: string;
  completed_at?: string | null;
  input_summary?: string | null;
  output_summary?: string | null;
  error_code?: string | null;
  duration_ms?: number | null;
  idempotency_key?: string | null;
  correlation_id?: string | null;
};

type SupabaseRoutingDecisionRow = {
  id: string;
  run_id: string;
  selected_agent: string;
  risk_level: RoutingDecisionRecord["riskLevel"];
  reason: string;
  needed_tools: string[];
  approval_required: boolean;
  correlation_id?: string | null;
  created_at: string;
};

type SupabaseAuditEventRow = {
  id: string;
  run_id?: string | null;
  agent_name?: string | null;
  tool_name?: string | null;
  risk_level?: AuditEventRecord["riskLevel"] | null;
  approval_id?: string | null;
  correlation_id?: string | null;
  event_type: string;
  outcome: AuditEventRecord["outcome"];
  metadata: AuditEventRecord["metadata"];
  created_at: string;
};

type SupabaseToolCallRow = {
  id: string;
  run_id: string;
  agent_name: string;
  tool_name: string;
  capability: ToolCallRecord["capability"];
  risk_level: ToolCallRecord["riskLevel"];
  approval_id?: string | null;
  correlation_id?: string | null;
  outcome: ToolCallRecord["outcome"];
  error_code?: string | null;
  created_at: string;
};

export class ExecutionPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionPersistenceError";
  }
}

function toApprovalRecord(row: SupabaseApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    requestingAgent: row.agent_name,
    actionType: row.action_type,
    target: { type: row.target_type, id: row.target_id },
    riskLevel: row.risk_level,
    payloadSummary: row.payload_summary,
    status: row.status,
    requestedAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at ?? undefined,
    result: row.result ?? undefined,
    expiresAt: row.expires_at ?? undefined,
  };
}

function toJobLeaseRecord(row: { lease_key: string; owner_id: string; acquired_at: string; expires_at: string }): JobLeaseRecord {
  return {
    leaseKey: row.lease_key,
    ownerId: row.owner_id,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
  };
}

function toAgentRunRecord(row: SupabaseAgentRunRow): AgentRunRecord {
  return {
    id: row.id,
    agentName: row.agent_name,
    provider: row.provider,
    model: row.model,
    routeAgent: row.route_agent,
    riskLevel: row.risk_level,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    inputSummary: row.input_summary ?? undefined,
    outputSummary: row.output_summary ?? undefined,
    errorCode: row.error_code ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    idempotencyKey: row.idempotency_key ?? undefined,
    correlationId: row.correlation_id ?? undefined,
  };
}

function toRoutingDecisionRecord(row: SupabaseRoutingDecisionRow): RoutingDecisionRecord {
  return {
    id: row.id,
    runId: row.run_id,
    selectedAgent: row.selected_agent,
    riskLevel: row.risk_level,
    reason: row.reason,
    neededTools: row.needed_tools,
    approvalRequired: row.approval_required,
    correlationId: row.correlation_id ?? undefined,
    createdAt: row.created_at,
  };
}

function toAuditEventRecord(row: SupabaseAuditEventRow): AuditEventRecord {
  return {
    id: row.id,
    runId: row.run_id ?? undefined,
    agentName: row.agent_name ?? undefined,
    toolName: row.tool_name ?? undefined,
    riskLevel: row.risk_level ?? undefined,
    approvalId: row.approval_id ?? undefined,
    correlationId: row.correlation_id ?? undefined,
    eventType: row.event_type,
    outcome: row.outcome,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function toToolCallRecord(row: SupabaseToolCallRow): ToolCallRecord {
  return {
    id: row.id,
    runId: row.run_id,
    agentName: row.agent_name,
    toolName: row.tool_name,
    capability: row.capability,
    riskLevel: row.risk_level,
    approvalId: row.approval_id ?? undefined,
    correlationId: row.correlation_id ?? undefined,
    outcome: row.outcome,
    errorCode: row.error_code ?? undefined,
    createdAt: row.created_at,
  };
}

export function createSupabaseExecutionRepository({
  url,
  serviceRoleKey,
  request = fetch,
}: SupabaseExecutionRepositoryOptions): ExecutionRepository {
  const baseUrl = `${url.replace(/\/$/, "")}/rest/v1`;

  async function requestRows<Row>(path: string, init: RequestInit): Promise<Row[]> {
    let response: Response;
    try {
      response = await request(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new ExecutionPersistenceError("Execution persistence could not be reached");
    }

    if (!response.ok) {
      throw new ExecutionPersistenceError(`Execution persistence returned status ${response.status}`);
    }

    try {
      return (await response.json()) as Row[];
    } catch {
      throw new ExecutionPersistenceError("Execution persistence returned malformed JSON");
    }
  }

  return {
    async createApproval(input: CreateApprovalInput) {
      const rows = await requestRows<SupabaseApprovalRow>("/approval_requests", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          agent_name: input.requestingAgent,
          action_type: input.actionType,
          target_type: input.target.type,
          target_id: input.target.id,
          risk_level: input.riskLevel,
          payload_summary: input.payloadSummary,
        }),
      });
      if (rows.length !== 1) {
        throw new ExecutionPersistenceError("Execution persistence did not return an approval record");
      }
      return toApprovalRecord(rows[0]);
    },

    async getApproval(approvalId: string) {
      const rows = await requestRows<SupabaseApprovalRow>(
        `/approval_requests?id=eq.${encodeURIComponent(approvalId)}&select=*`,
        { method: "GET" },
      );
      return rows[0] ? toApprovalRecord(rows[0]) : undefined;
    },

    async listApprovals() {
      const rows = await requestRows<SupabaseApprovalRow>(
        "/approval_requests?select=*&order=created_at.desc",
        { method: "GET" },
      );
      return rows.map(toApprovalRecord);
    },

    async decideApproval(input: ApprovalDecisionInput) {
      const timestamp = new Date().toISOString();
      const rows = await requestRows<SupabaseApprovalRow>(
        `/approval_requests?id=eq.${encodeURIComponent(input.approvalId)}&status=eq.pending`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            status: input.status,
            result: input.result,
            decided_at: timestamp,
            updated_at: timestamp,
          }),
        },
      );
      if (rows.length !== 1) {
        throw new ExecutionPersistenceError("Approval request was not found or is no longer pending");
      }
      return toApprovalRecord(rows[0]);
    },

    async createAgentRun(input: CreateAgentRunInput) {
      const rows = await requestRows<SupabaseAgentRunRow>("/agent_runs", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          agent_name: input.agentName,
          provider: input.provider,
          model: input.model,
          route_agent: input.routeAgent,
          risk_level: input.riskLevel,
          input_summary: input.inputSummary,
          idempotency_key: input.idempotencyKey,
          correlation_id: input.correlationId,
        }),
      });
      if (rows.length !== 1) {
        throw new ExecutionPersistenceError("Execution persistence did not return an agent-run record");
      }
      return toAgentRunRecord(rows[0]);
    },

    async acquireJobLease(input: AcquireJobLeaseInput) {
      const rows = await requestRows<{ lease_key: string; owner_id: string; acquired_at: string; expires_at: string }>(
        "/rpc/acquire_job_lease",
        {
          method: "POST",
          body: JSON.stringify({
            p_lease_key: input.leaseKey,
            p_owner_id: input.ownerId,
            p_lease_duration_ms: input.leaseDurationMs,
          }),
        },
      );
      return rows[0] ? toJobLeaseRecord(rows[0]) : undefined;
    },
    async releaseJobLease(input: ReleaseJobLeaseInput) {
      const rows = await requestRows<{ released: boolean }>(
        "/rpc/release_job_lease",
        {
          method: "POST",
          body: JSON.stringify({ p_lease_key: input.leaseKey, p_owner_id: input.ownerId }),
        },
      );
      return rows[0]?.released === true;
    },
    async findAgentRunByIdempotencyKey(idempotencyKey) {
      const rows = await requestRows<SupabaseAgentRunRow>(
        `/agent_runs?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`,
        {},
      );
      return rows[0] ? toAgentRunRecord(rows[0]) : undefined;
    },
    async completeAgentRun(input: CompleteAgentRunInput) {
      const timestamp = new Date().toISOString();
      const rows = await requestRows<SupabaseAgentRunRow>(
        `/agent_runs?id=eq.${encodeURIComponent(input.runId)}&status=eq.running`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            status: input.status,
            completed_at: timestamp,
            output_summary: input.outputSummary,
            error_code: input.errorCode,
            duration_ms: input.durationMs,
          }),
        },
      );
      if (rows.length !== 1) {
        throw new ExecutionPersistenceError("Agent run was not found or is no longer running");
      }
      return toAgentRunRecord(rows[0]);
    },

    async recordRoutingDecision(input: RecordRoutingDecisionInput) {
      const rows = await requestRows<SupabaseRoutingDecisionRow>("/routing_decisions", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          run_id: input.runId,
          selected_agent: input.selectedAgent,
          risk_level: input.riskLevel,
          reason: input.reason,
          needed_tools: input.neededTools,
          approval_required: input.approvalRequired,
          correlation_id: input.correlationId,
        }),
      });
      if (rows.length !== 1) {
        throw new ExecutionPersistenceError("Execution persistence did not return a routing-decision record");
      }
      return toRoutingDecisionRecord(rows[0]);
    },

    async recordAuditEvent(input: RecordAuditEventInput) {
      const rows = await requestRows<SupabaseAuditEventRow>("/audit_events", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          run_id: input.runId,
          agent_name: input.agentName,
          tool_name: input.toolName,
          risk_level: input.riskLevel,
          approval_id: input.approvalId,
          correlation_id: input.correlationId,
          event_type: input.eventType,
          outcome: input.outcome,
          metadata: input.metadata,
        }),
      });
      if (rows.length !== 1) {
        throw new ExecutionPersistenceError("Execution persistence did not return an audit-event record");
      }
      return toAuditEventRecord(rows[0]);
    },

    async recordToolCall(input: RecordToolCallInput) {
      const rows = await requestRows<SupabaseToolCallRow>("/tool_calls", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          run_id: input.runId,
          agent_name: input.agentName,
          tool_name: input.toolName,
          capability: input.capability,
          risk_level: input.riskLevel,
          approval_id: input.approvalId,
          correlation_id: input.correlationId,
          outcome: input.outcome,
          error_code: input.errorCode,
        }),
      });
      if (rows.length !== 1) {
        throw new ExecutionPersistenceError("Execution persistence did not return a tool-call record");
      }
      return toToolCallRecord(rows[0]);
    },

    async listAgentRuns() {
      const rows = await requestRows<SupabaseAgentRunRow>("/agent_runs?select=*&order=created_at.desc", {
        method: "GET",
      });
      return rows.map(toAgentRunRecord);
    },

    async listRoutingDecisions() {
      const rows = await requestRows<SupabaseRoutingDecisionRow>(
        "/routing_decisions?select=*&order=created_at.desc",
        { method: "GET" },
      );
      return rows.map(toRoutingDecisionRecord);
    },

    async listAuditEvents() {
      const rows = await requestRows<SupabaseAuditEventRow>("/audit_events?select=*&order=created_at.desc", {
        method: "GET",
      });
      return rows.map(toAuditEventRecord);
    },

    async listToolCalls() {
      const rows = await requestRows<SupabaseToolCallRow>("/tool_calls?select=*&order=created_at.desc", {
        method: "GET",
      });
      return rows.map(toToolCallRecord);
    },
  };
}
