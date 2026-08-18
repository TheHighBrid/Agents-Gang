import { evaluateApprovalGate, type RiskLevel } from "./approval-engine";
import { assertToolPolicy } from "./policy-registry";
import type { ExecutionRepository } from "./repository";

export type ToolCapability = "read" | "draft" | "prepare" | "execute";

export type ToolDefinition<Input, Output> = {
  name: string;
  capability: ToolCapability;
  riskLevel: RiskLevel;
  parseInput(input: unknown): Input;
  getTarget?(input: Input): { type: string; id: string };
  execute(input: Input): Promise<Output>;
};

export type ToolExecutionContext = {
  repository: ExecutionRepository;
  runId: string;
  agentName: string;
  approvalId?: string;
  correlationId?: string;
};

export type ToolFailure = {
  ok: false;
  error: {
    code:
      | "approval_required"
      | "approval_not_approved"
      | "approval_expired"
      | "invalid_input"
      | "tool_execution_failed";
    message: string;
    retriable: boolean;
  };
};

export type ToolSuccess<Output> = {
  ok: true;
  data: Output;
};

const SAFE_ADAPTER_ERROR_CODES = new Set([
  "shopify_auth_failed",
  "shopify_rate_limited",
  "shopify_timeout",
  "shopify_upstream_failed",
  "shopify_transport_failed",
  "shopify_graphql_failed",
  "shopify_user_error",
  "shopify_malformed_response",
  "gmail_auth_failed",
  "gmail_rate_limited",
  "gmail_upstream_failed",
  "gmail_transport_failed",
  "gmail_timeout",
  "gmail_malformed_response",
]);

function normalizeExecutionFailure(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; retriable?: unknown };
    if (typeof candidate.code === "string" && SAFE_ADAPTER_ERROR_CODES.has(candidate.code)) {
      return { errorCode: candidate.code, retriable: candidate.retriable === true };
    }
  }
  return { errorCode: "tool_execution_failed", retriable: true };
}

function auditMetadata(context: ToolExecutionContext, errorCode?: string) {
  return {
    ...(context.correlationId ? { correlationId: context.correlationId } : {}),
    ...(errorCode ? { errorCode } : {}),
  };
}

export function defineTool<Input, Output>(definition: ToolDefinition<Input, Output>) {
  assertToolPolicy(definition);
  return definition;
}

export async function executeTool<Input, Output>(
  context: ToolExecutionContext,
  tool: ToolDefinition<Input, Output>,
  rawInput: unknown,
): Promise<ToolSuccess<Output> | ToolFailure> {
  // Enforce governance at the actual execution boundary as well as at tool-definition time.
  // Callers cannot bypass policy by constructing a ToolDefinition directly.
  const policy = assertToolPolicy(tool);
  const approval = context.approvalId
    ? await context.repository.getApproval(context.approvalId)
    : undefined;
  const matchingApproval = approval?.actionType === policy.actionType ? approval : undefined;
  const gate = policy.approvalRequired
    ? evaluateApprovalGate({
      riskLevel: policy.riskLevel,
      approval: matchingApproval,
    })
    : { allowed: true as const };

  if (!gate.allowed) {
    await context.repository.recordToolCall({
      runId: context.runId,
      agentName: context.agentName,
      toolName: policy.actionType,
      capability: policy.capability,
      riskLevel: policy.riskLevel,
      approvalId: context.approvalId,
      outcome: "blocked",
      errorCode: gate.reason,
    });
    await context.repository.recordAuditEvent({
      runId: context.runId,
      agentName: context.agentName,
      toolName: policy.actionType,
      riskLevel: policy.riskLevel,
      approvalId: context.approvalId,
      eventType: "tool.execution",
      outcome: "blocked",
      metadata: auditMetadata(context, gate.reason),
    });
    return {
      ok: false,
      error: {
        code: gate.reason,
        message: "An approved approval request is required before this tool can execute.",
        retriable: false,
      },
    };
  }

  let input: Input;
  try {
    input = tool.parseInput(rawInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool input is invalid.";
    await context.repository.recordToolCall({
      runId: context.runId,
      agentName: context.agentName,
      toolName: policy.actionType,
      capability: policy.capability,
      riskLevel: policy.riskLevel,
      approvalId: context.approvalId,
      outcome: "failed",
      errorCode: "invalid_input",
    });
    await context.repository.recordAuditEvent({
      runId: context.runId,
      agentName: context.agentName,
      toolName: policy.actionType,
      riskLevel: policy.riskLevel,
      approvalId: context.approvalId,
      eventType: "tool.execution",
      outcome: "failed",
      metadata: auditMetadata(context, "invalid_input"),
    });
    return {
      ok: false,
      error: { code: "invalid_input", message, retriable: false },
    };
  }

  const target = tool.getTarget?.(input);
  if (
    matchingApproval &&
    target &&
    (matchingApproval.target.type !== target.type || matchingApproval.target.id !== target.id)
  ) {
    await context.repository.recordToolCall({
      runId: context.runId,
      agentName: context.agentName,
      toolName: policy.actionType,
      capability: policy.capability,
      riskLevel: policy.riskLevel,
      approvalId: matchingApproval.id,
      outcome: "blocked",
      errorCode: "approval_required",
    });
    await context.repository.recordAuditEvent({
      runId: context.runId,
      agentName: context.agentName,
      toolName: policy.actionType,
      riskLevel: policy.riskLevel,
      approvalId: matchingApproval.id,
      eventType: "tool.execution",
      outcome: "blocked",
      metadata: auditMetadata(context, "approval_required"),
    });
    return {
      ok: false,
      error: {
        code: "approval_required",
        message: "An approved approval request is required before this tool can execute.",
        retriable: false,
      },
    };
  }

  try {
    if (matchingApproval) await context.repository.consumeApproval(matchingApproval.id);
    const data = await tool.execute(input);
    await context.repository.recordToolCall({
      runId: context.runId,
      agentName: context.agentName,
      toolName: policy.actionType,
      capability: policy.capability,
      riskLevel: policy.riskLevel,
      approvalId: context.approvalId,
      outcome: "succeeded",
    });
    await context.repository.recordAuditEvent({
      runId: context.runId,
      agentName: context.agentName,
      toolName: policy.actionType,
      riskLevel: policy.riskLevel,
      approvalId: context.approvalId,
      eventType: "tool.execution",
      outcome: "succeeded",
      metadata: auditMetadata(context),
    });
    return { ok: true, data };
  } catch (error) {
    const failure = normalizeExecutionFailure(error);
    const message = error instanceof Error ? error.message : "Tool execution failed.";
    await context.repository.recordToolCall({
      runId: context.runId,
      agentName: context.agentName,
      toolName: policy.actionType,
      capability: policy.capability,
      riskLevel: policy.riskLevel,
      approvalId: context.approvalId,
      outcome: "failed",
      errorCode: failure.errorCode,
    });
    await context.repository.recordAuditEvent({
      runId: context.runId,
      agentName: context.agentName,
      toolName: policy.actionType,
      riskLevel: policy.riskLevel,
      approvalId: context.approvalId,
      eventType: "tool.execution",
      outcome: "failed",
      metadata: auditMetadata(context, failure.errorCode),
    });
    return {
      ok: false,
      error: { code: "tool_execution_failed", message, retriable: failure.retriable },
    };
  }
}
