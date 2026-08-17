import { createExecutionRepository, ExecutionRepositoryConfigurationError } from "../../../lib/execution/execution-repository-factory";
import { authorizeFounderRequest, founderAuthorizationResponse } from "../../../lib/approvals/auth";

export async function GET(request: Request) {
  const authorization = founderAuthorizationResponse(authorizeFounderRequest(request, process.env));
  if (authorization) return authorization;

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
