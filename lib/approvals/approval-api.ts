import type { ExecutionRepository } from "../execution/repository";

export async function getApprovalListResponse(repository: ExecutionRepository): Promise<Response> {
  const approvals = await repository.listApprovals();
  return Response.json({ approvals });
}
