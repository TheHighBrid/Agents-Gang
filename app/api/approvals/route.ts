import { createExecutionRepository, ExecutionRepositoryConfigurationError } from "../../../lib/execution/execution-repository-factory";
import { isApprovalApiAuthorized } from "../../../lib/approvals/auth";

function unauthorizedResponse() {
  return Response.json(
    { error: "Approval API authentication required" },
    {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    },
  );
}

export async function GET(request: Request) {
  if (!isApprovalApiAuthorized(request, process.env.APPROVALS_API_TOKEN)) {
    return unauthorizedResponse();
  }

  try {
    const repository = createExecutionRepository(process.env);
    return Response.json({ approvals: await repository.listApprovals() });
  } catch (error) {
    if (error instanceof ExecutionRepositoryConfigurationError) {
      return Response.json({ error: "Approval storage is not configured" }, { status: 503 });
    }
    return Response.json({ error: "Unable to load approvals" }, { status: 500 });
  }
}
