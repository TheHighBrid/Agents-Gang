import { authorizeFounderRequest, founderAuthorizationResponse } from "../../../lib/approvals/auth";
import { getDashboardSnapshotResponse } from "../../../lib/dashboard/dashboard-api";
import { createExecutionRepository, ExecutionRepositoryConfigurationError } from "../../../lib/execution/execution-repository-factory";

export async function GET(request: Request) {
  const authorization = founderAuthorizationResponse(authorizeFounderRequest(request, process.env));
  if (authorization) return authorization;

  try {
    const repository = createExecutionRepository(process.env);
    return await getDashboardSnapshotResponse(repository);
  } catch (error) {
    if (error instanceof ExecutionRepositoryConfigurationError) {
      return Response.json({ error: "Execution storage is not configured" }, { status: 503 });
    }
    return Response.json({ error: "Unable to load dashboard data" }, { status: 500 });
  }
}
