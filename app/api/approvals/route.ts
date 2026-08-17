import { createExecutionRepository } from "../../../lib/execution/execution-repository-factory";

const invalidDecisionMessage =
  "approvalId, status, and result are required; status must be approved or rejected";

export async function GET() {
  try {
    const repository = createExecutionRepository(process.env);
    const approvals = await repository.listApprovals();
    return Response.json({ approvals });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load approvals" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: invalidDecisionMessage }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: invalidDecisionMessage }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const approvalId = typeof input.approvalId === "string" ? input.approvalId.trim() : "";
  const status = input.status;
  const result = typeof input.result === "string" ? input.result.trim() : "";

  if (
    !approvalId ||
    (status !== "approved" && status !== "rejected") ||
    !result
  ) {
    return Response.json({ error: invalidDecisionMessage }, { status: 400 });
  }

  try {
    const repository = createExecutionRepository(process.env);
    const approval = await repository.decideApproval({
      approvalId,
      status,
      result,
    });
    return Response.json({ approval });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to decide approval" },
      { status: 409 },
    );
  }
}
