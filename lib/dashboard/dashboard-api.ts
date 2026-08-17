import type { ExecutionRepository } from "../execution/repository";

export async function getDashboardSnapshotResponse(repository: ExecutionRepository): Promise<Response> {
  const [runs, routingDecisions, toolCalls, auditEvents, approvals] = await Promise.all([
    repository.listAgentRuns(),
    repository.listRoutingDecisions(),
    repository.listToolCalls(),
    repository.listAuditEvents(),
    repository.listApprovals(),
  ]);

  return Response.json({ runs, routingDecisions, toolCalls, auditEvents, approvals });
}
