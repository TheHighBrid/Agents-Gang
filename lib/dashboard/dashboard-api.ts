import type {
  AgentRunRecord,
  ApprovalRecord,
  AuditEventRecord,
  ExecutionRepository,
  RoutingDecisionRecord,
  ToolCallRecord,
} from "../execution/repository";
import { isValidCorrelationId } from "../observability/correlation";

const DASHBOARD_RESULT_LIMIT = 50;

export type DashboardRun = Pick<
  AgentRunRecord,
  "id" | "agentName" | "status" | "riskLevel" | "createdAt" | "completedAt" | "errorCode" | "durationMs"
> & { correlationId?: string };

export type DashboardRoutingDecision = Pick<
  RoutingDecisionRecord,
  "id" | "runId" | "selectedAgent" | "riskLevel" | "neededTools" | "approvalRequired" | "createdAt"
> & { reason: string };

export type DashboardToolCall = Pick<
  ToolCallRecord,
  "id" | "runId" | "agentName" | "toolName" | "capability" | "riskLevel" | "approvalId" | "outcome" | "errorCode" | "createdAt"
>;

export type DashboardAuditEvent = Pick<
  AuditEventRecord,
  "id" | "runId" | "agentName" | "toolName" | "riskLevel" | "approvalId" | "eventType" | "outcome" | "createdAt"
>;

export type DashboardApproval = Pick<
  ApprovalRecord,
  "id" | "requestingAgent" | "actionType" | "target" | "riskLevel" | "status" | "requestedAt" | "updatedAt" | "decidedAt" | "expiresAt"
>;

export type DashboardSnapshot = {
  runs: DashboardRun[];
  routingDecisions: DashboardRoutingDecision[];
  toolCalls: DashboardToolCall[];
  auditEvents: DashboardAuditEvent[];
  approvals: DashboardApproval[];
};

export async function getDashboardSnapshotResponse(repository: ExecutionRepository): Promise<Response> {
  const [runs, routingDecisions, toolCalls, auditEvents, approvals] = await Promise.all([
    repository.listAgentRuns(),
    repository.listRoutingDecisions(),
    repository.listToolCalls(),
    repository.listAuditEvents(),
    repository.listApprovals(),
  ]);
  const correlationByRunId = buildCorrelationIndex(auditEvents);

  const snapshot: DashboardSnapshot = {
    runs: newestFirst(runs.map((run) => toDashboardRun(run, correlationByRunId.get(run.id))), (run) => run.createdAt),
    routingDecisions: newestFirst(routingDecisions.map(toDashboardRoutingDecision), (decision) => decision.createdAt),
    toolCalls: newestFirst(toolCalls.map(toDashboardToolCall), (toolCall) => toolCall.createdAt),
    auditEvents: newestFirst(auditEvents.map(toDashboardAuditEvent), (event) => event.createdAt),
    approvals: newestFirst(approvals.map(toDashboardApproval), (approval) => approval.requestedAt),
  };

  return Response.json(snapshot);
}

function buildCorrelationIndex(auditEvents: AuditEventRecord[]) {
  const index = new Map<string, string>();
  for (const event of auditEvents) {
    if (event.eventType !== "run.correlation" || !event.runId) continue;
    const correlationId = event.metadata.correlationId;
    if (isValidCorrelationId(correlationId)) index.set(event.runId, correlationId);
  }
  return index;
}

function toDashboardRun(run: AgentRunRecord, correlationId?: string): DashboardRun {
  return {
    id: run.id,
    agentName: run.agentName,
    status: run.status,
    riskLevel: run.riskLevel,
    createdAt: run.createdAt,
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.errorCode ? { errorCode: run.errorCode } : {}),
    ...(run.durationMs !== undefined ? { durationMs: run.durationMs } : {}),
    ...(correlationId ? { correlationId } : {}),
  };
}

function toDashboardRoutingDecision(decision: RoutingDecisionRecord): DashboardRoutingDecision {
  return {
    id: decision.id,
    runId: decision.runId,
    selectedAgent: decision.selectedAgent,
    riskLevel: decision.riskLevel,
    reason: safeRoutingReason(decision),
    neededTools: [...decision.neededTools],
    approvalRequired: decision.approvalRequired,
    createdAt: decision.createdAt,
  };
}

function safeRoutingReason(decision: RoutingDecisionRecord): string {
  const toolCount = decision.neededTools.length;
  const toolLabel = toolCount === 1 ? "governed tool" : "governed tools";
  const approvalLabel = decision.approvalRequired ? "approval required" : "no approval required";
  return `${decision.selectedAgent} selected at risk ${decision.riskLevel}; ${toolCount} ${toolLabel}; ${approvalLabel}.`;
}

function toDashboardToolCall(toolCall: ToolCallRecord): DashboardToolCall {
  return {
    id: toolCall.id,
    runId: toolCall.runId,
    agentName: toolCall.agentName,
    toolName: toolCall.toolName,
    capability: toolCall.capability,
    riskLevel: toolCall.riskLevel,
    outcome: toolCall.outcome,
    createdAt: toolCall.createdAt,
    ...(toolCall.approvalId ? { approvalId: toolCall.approvalId } : {}),
    ...(toolCall.errorCode ? { errorCode: toolCall.errorCode } : {}),
  };
}

function toDashboardAuditEvent(event: AuditEventRecord): DashboardAuditEvent {
  return {
    id: event.id,
    eventType: event.eventType,
    outcome: event.outcome,
    createdAt: event.createdAt,
    ...(event.runId ? { runId: event.runId } : {}),
    ...(event.agentName ? { agentName: event.agentName } : {}),
    ...(event.toolName ? { toolName: event.toolName } : {}),
    ...(event.riskLevel !== undefined ? { riskLevel: event.riskLevel } : {}),
    ...(event.approvalId ? { approvalId: event.approvalId } : {}),
  };
}

function toDashboardApproval(approval: ApprovalRecord): DashboardApproval {
  return {
    id: approval.id,
    requestingAgent: approval.requestingAgent,
    actionType: approval.actionType,
    target: { ...approval.target },
    riskLevel: approval.riskLevel,
    status: approval.status,
    requestedAt: approval.requestedAt,
    updatedAt: approval.updatedAt,
    ...(approval.decidedAt ? { decidedAt: approval.decidedAt } : {}),
    ...(approval.expiresAt ? { expiresAt: approval.expiresAt } : {}),
  };
}

function newestFirst<T extends { id: string }>(items: T[], timestamp: (item: T) => string): T[] {
  return [...items]
    .sort((left, right) => timestamp(right).localeCompare(timestamp(left)) || right.id.localeCompare(left.id))
    .slice(0, DASHBOARD_RESULT_LIMIT);
}
