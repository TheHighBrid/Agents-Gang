import { createExecutionRepository } from "../../../lib/execution/execution-repository-factory";

export async function GET() {
  try {
    const repository = createExecutionRepository(process.env);
    const [runs, routingDecisions, auditEvents] = await Promise.all([
      repository.listAgentRuns(),
      repository.listRoutingDecisions(),
      repository.listAuditEvents(),
    ]);

    return Response.json({ runs, routingDecisions, auditEvents });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load dashboard data" },
      { status: 500 },
    );
  }
}
