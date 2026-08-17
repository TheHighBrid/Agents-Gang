import { timingSafeEqual } from "node:crypto";
import { createExecutionRepository } from "../../../lib/execution/execution-repository-factory";
import type { ExecutionRepository } from "../../../lib/execution/repository";

type ExecutionEnvironment = Record<string, string | undefined>;

function isAuthorized(request: Request, environment: ExecutionEnvironment) {
  const configuredKey = environment.APPROVALS_API_KEY;
  if (!configuredKey) return true;
  const expected = Buffer.from(configuredKey);
  const provided = Buffer.from(request.headers.get("x-approval-api-key") ?? "");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function unauthorizedResponse() {
  return Response.json({ error: "A valid governance API key is required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}

export async function getExecutions(request: Request, repository: ExecutionRepository, environment: ExecutionEnvironment = process.env) {
  if (!isAuthorized(request, environment)) return unauthorizedResponse();
  try {
    const [runs, routingDecisions, approvals, toolCalls, auditEvents] = await Promise.all([
      repository.listAgentRuns(),
      repository.listRoutingDecisions(),
      repository.listApprovals(),
      repository.listToolCalls(),
      repository.listAuditEvents(),
    ]);
    return Response.json({ runs, routingDecisions, approvals, toolCalls, auditEvents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load executions" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(request: Request) {
  return getExecutions(request, createExecutionRepository(process.env));
}
