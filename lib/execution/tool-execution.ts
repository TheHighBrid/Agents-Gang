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

export function defineTool<Input, Output>(definition: ToolDefinition<Input, Output>) {
  assertToolPolicy(definition);
  return definition;
}

export async function executeTool<Input, Output>(
  context: ToolExecutionContext,
  tool: ToolDefinition<Input, Output>,
  rawInput: unknown,
): Promise<ToolSuccess<Output> | ToolFailure> {
  const approval = context.approvalId
    ? await context.repository.getApproval(context.approvalId)
    : undefined;
  const matchingApproval = approval?.actionType === tool.name ? approval : undefined;
  const gate = evaluateApprovalGate({
    riskLevel: tool.riskLevel,
    approval: matchingApproval,
  });

  if (!gate.allowed) {
    await context.repository.recordToolCall({
      runId: context.runId,
      agentName: context.agentName,
      toolName: tool.name,
      capability: tool.capability,
      riskLevel: tool.riskLevel,
      approvalId: context.approvalId,
      correlationId: context.correlationId,
      outcome: "blocked",
      errorCode: gate.reason,
    });
    await context.repository.recordAuditEvent({
      runId: context.runId,
      agentName: context.agentName,
      toolName: tool.name,
      riskLevel: tool.riskLevel,
      approvalId: context.approvalId,
      correlationId: context.correlationId,
      eventType: "tool.execution",
      outcome: "blocked",
      metadata: { errorCode: gate.reason },
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
      toolName: tool.name,
      capability: tool.capability,
      riskLevel: tool.riskLevel,
      approvalId: context.approvalId,
      correlationId: context.correlationId,
      outcome: "failed",
      errorCode: "invalid_input",
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
      toolName: tool.name,
      capability: tool.capability,
      riskLevel: tool.riskLevel,
      approvalId: matchingApproval.id,
      correlationId: context.correlationId,
      outcome: "blocked",
      errorCode: "approval_required",
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
      toolName: tool.name,
      capability: tool.capability,
      riskLevel: tool.riskLevel,
      approvalId: context.approvalId,
      correlationId: context.correlationId,
      outcome: "succeeded",
    });
    await context.repository.recordAuditEvent({
      runId: context.runId,
      agentName: context.agentName,
      toolName: tool.name,
      riskLevel: tool.riskLevel,
      approvalId: context.approvalId,
      correlationId: context.correlationId,
      eventType: "tool.execution",
      outcome: "succeeded",
      metadata: {},
    });
    return { ok: true, data };
  } catch (error) {
    const failure = normalizeExecutionFailure(error);
    const message = error instanceof Error ? error.message : "Tool execution failed.";
    await context.repository.recordToolCall({
      runId: context.runId,
      agentName: context.agentName,
      toolName: tool.name,
      capability: tool.capability,
      riskLevel: tool.riskLevel,
      approvalId: context.approvalId,
      correlationId: context.correlationId,
      outcome: "failed",
      errorCode: failure.errorCode,
    });
    await context.repository.recordAuditEvent({
      runId: context.runId,
      agentName: context.agentName,
      toolName: tool.name,
      riskLevel: tool.riskLevel,
      approvalId: context.approvalId,
      correlationId: context.correlationId,
      eventType: "tool.execution",
      outcome: "failed",
      metadata: { errorCode: failure.errorCode },
    });
    return {
      ok: false,
      error: { code: "tool_execution_failed", message, retriable: failure.retriable },
    };
  }
}
