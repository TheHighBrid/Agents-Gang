import { createExecutionRepository } from "../../../lib/execution/execution-repository-factory";
import { summarizeOperationalHealth } from "../../../lib/observability/operational-health";

export async function GET() {
  try {
    const repository = createExecutionRepository(process.env);
    const [runs, routingDecisions, auditEvents, toolCalls] = await Promise.all([
      repository.listAgentRuns(),
      repository.listRoutingDecisions(),
      repository.listAuditEvents(),
      repository.listToolCalls(),
    ]);
    const operationalHealth = summarizeOperationalHealth({ runs, auditEvents, toolCalls });

    return Response.json({ runs, routingDecisions, auditEvents, operationalHealth });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load dashboard data" },
      { status: 500 },
    );
  }
}
