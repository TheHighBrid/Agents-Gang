import { isApprovalApiAuthorized } from "../../../lib/approvals/auth";
import { getDashboardSnapshotResponse } from "../../../lib/dashboard/dashboard-api";
import { createExecutionRepository, ExecutionRepositoryConfigurationError } from "../../../lib/execution/execution-repository-factory";

export async function GET(request: Request) {
  if (!isApprovalApiAuthorized(request, process.env.APPROVALS_API_TOKEN)) {
    return Response.json(
      { error: "Dashboard API authentication required" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  try {
    const repository = createExecutionRepository(process.env);
    return getDashboardSnapshotResponse(repository);
  } catch (error) {
    if (error instanceof ExecutionRepositoryConfigurationError) {
      return Response.json({ error: "Execution storage is not configured" }, { status: 503 });
    }
    return Response.json({ error: "Unable to load dashboard data" }, { status: 500 });
  }
}
