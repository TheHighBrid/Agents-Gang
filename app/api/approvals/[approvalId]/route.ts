import { authorizeFounderRequest, founderAuthorizationResponse } from "../../../../lib/approvals/auth";
import { getApprovalDetailResponse, toSafeApproval } from "../../../../lib/approvals/approval-api";
import { createExecutionRepository, ExecutionRepositoryConfigurationError } from "../../../../lib/execution/execution-repository-factory";
import { isApprovalExpired } from "../../../../lib/execution/approval-engine";
import type { ExecutionRepository } from "../../../../lib/execution/repository";

type RouteContext = { params: Promise<{ approvalId: string }> };

type RuntimeAuthorization = {
  actor: string;
  founderAuthorization: string;
  response: Response | null;
};

function runtimeAuthorization(request: Request): RuntimeAuthorization {
  const identity = authorizeFounderRequest(request, process.env);
  return {
    actor: identity.ok ? identity.identity.subject : "unknown",
    founderAuthorization: request.headers.get("authorization") ?? "",
    response: founderAuthorizationResponse(identity),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const authorization = runtimeAuthorization(request);
  if (authorization.response) return authorization.response;

  const { approvalId } = await context.params;
  if (!approvalId) return Response.json({ error: "Approval ID is required" }, { status: 400 });
  try {
    return await getApprovalDetailResponse(
      createExecutionRepository(process.env, { founderAuthorization: authorization.founderAuthorization }),
      approvalId,
    );
  } catch (error) {
    return storageError(error, "Unable to load approval");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = runtimeAuthorization(request);
  if (authorization.response) return authorization.response;

  const { approvalId } = await context.params;
  if (!approvalId) return Response.json({ error: "Approval ID is required" }, { status: 400 });

  let body: { status?: unknown; result?: unknown };
  try {
    body = (await request.json()) as { status?: unknown; result?: unknown };
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (body.status !== "approved" && body.status !== "rejected") {
    return Response.json({ error: "Status must be approved or rejected" }, { status: 400 });
  }
  if (typeof body.result !== "string" || body.result.trim().length === 0) {
    return Response.json({ error: "A decision note is required" }, { status: 400 });
  }
  if (body.result.trim().length > 2_000) {
    return Response.json({ error: "Decision note must be 2,000 characters or fewer" }, { status: 413 });
  }

  let repository: ExecutionRepository | undefined;
  try {
    repository = createExecutionRepository(process.env, {
      founderAuthorization: authorization.founderAuthorization,
    });
    const existing = await repository.getApproval(approvalId);
    if (!existing) {
      await audit(repository, approvalId, authorization.actor, body.status, "failed", "not_found");
      return Response.json({ error: "Approval request was not found" }, { status: 404 });
    }
    if (existing.status !== "pending" || isApprovalExpired(existing.expiresAt)) {
      await audit(repository, approvalId, authorization.actor, body.status, "blocked", "not_pending");
      return Response.json({ error: "Approval request is no longer pending" }, { status: 409 });
    }
    const approval = await repository.decideApproval({ approvalId, status: body.status, result: body.result.trim() });
    await audit(repository, approvalId, authorization.actor, body.status, "succeeded");
    return Response.json({ approval: toSafeApproval(approval) });
  } catch (error) {
    if (repository) {
      await audit(repository, approvalId, authorization.actor, body.status, "blocked", "conflict").catch(() => undefined);
    }
    if (error instanceof ExecutionRepositoryConfigurationError) return storageError(error, "Unable to decide approval");
    return Response.json({ error: "Approval request is no longer pending" }, { status: 409 });
  }
}

async function audit(repository: ExecutionRepository, approvalId: string, actor: string, decision: string, outcome: "blocked" | "succeeded" | "failed", reason?: string) {
  await repository.recordAuditEvent({
    approvalId,
    eventType: "approval.decision",
    outcome,
    metadata: { actor, decision, ...(reason ? { reason } : {}) },
  });
}

function storageError(error: unknown, fallback: string) {
  if (error instanceof ExecutionRepositoryConfigurationError) {
    return Response.json({ error: "Approval storage is not configured" }, { status: 503 });
  }
  return Response.json({ error: fallback }, { status: 500 });
}
