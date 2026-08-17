import { createExecutionRepository, ExecutionRepositoryConfigurationError } from "../../../lib/execution/execution-repository-factory";
import { authorizeFounderRequest, founderAuthorizationResponse } from "../../../lib/approvals/auth";
import { getApprovalListResponse } from "../../../lib/approvals/approval-api";

export async function GET(request: Request) {
  const authorization = founderAuthorizationResponse(authorizeFounderRequest(request, process.env));
  if (authorization) return authorization;
  try {
    return await getApprovalListResponse(createExecutionRepository(process.env), request.url);
  } catch (error) {
    if (error instanceof ExecutionRepositoryConfigurationError) {
      return Response.json({ error: "Approval storage is not configured" }, { status: 503 });
    }
    if (error instanceof Error && /invalid|must|too long/i.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "Unable to load approvals" }, { status: 500 });
  }
}
