import {
  createExecutionRepository,
  ExecutionRepositoryConfigurationError,
} from "../../../lib/execution/execution-repository-factory";
import { getApprovalListResponse } from "../../../lib/approvals/approval-api";

export async function GET() {
  try {
    const repository = createExecutionRepository(process.env);
    return await getApprovalListResponse(repository);
  } catch (error) {
    if (error instanceof ExecutionRepositoryConfigurationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Unable to load approval requests" }, { status: 500 });
  }
}
