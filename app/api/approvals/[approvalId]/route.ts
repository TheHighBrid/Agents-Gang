import { isApprovalApiAuthorized } from "../../../../lib/approvals/auth";
import { createExecutionRepository, ExecutionRepositoryConfigurationError } from "../../../../lib/execution/execution-repository-factory";

function unauthorizedResponse() {
  return Response.json(
    { error: "Approval API authentication required" },
    {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    },
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  if (!isApprovalApiAuthorized(request, process.env.APPROVALS_API_TOKEN)) {
    return unauthorizedResponse();
  }

  const { approvalId } = await context.params;
  if (!approvalId) {
    return Response.json({ error: "Approval ID is required" }, { status: 400 });
  }

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

  try {
    const repository = createExecutionRepository(process.env);
    const approval = await repository.decideApproval({
      approvalId,
      status: body.status,
      result: body.result.trim(),
    });
    return Response.json({ approval });
  } catch (error) {
    if (error instanceof ExecutionRepositoryConfigurationError) {
      return Response.json({ error: "Approval storage is not configured" }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unable to decide approval";
    const status = message.includes("not found") || message.includes("no longer pending") ? 409 : 500;
    return Response.json({ error: status === 409 ? message : "Unable to decide approval" }, { status });
  }
}
