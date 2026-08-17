import type { AgentRunRecord, ExecutionRepository } from "../lib/execution/repository";
import type { RiskLevel } from "../lib/execution/approval-engine";
import type { ToolExecutionContext } from "../lib/execution/tool-execution";

export type GovernedJobDefinition<T> = {
  repository: ExecutionRepository;
  agentName: string;
  inputSummary: string;
  reason: string;
  neededTools: string[];
  riskLevel?: RiskLevel;
  execute: (context: ToolExecutionContext) => Promise<T>;
};

export type GovernedJobResult<T> = {
  run: AgentRunRecord;
  data: T;
};

export async function runGovernedJob<T>(definition: GovernedJobDefinition<T>): Promise<GovernedJobResult<T>> {
  const startedAt = Date.now();
  const riskLevel = definition.riskLevel ?? 1;
  const run = await definition.repository.createAgentRun({
    agentName: definition.agentName,
    provider: "scheduled",
    model: "governed-job",
    routeAgent: definition.agentName,
    riskLevel,
    inputSummary: definition.inputSummary,
  });

  await definition.repository.recordRoutingDecision({
    runId: run.id,
    selectedAgent: definition.agentName,
    riskLevel,
    reason: definition.reason,
    neededTools: definition.neededTools,
    approvalRequired: riskLevel >= 3,
  });

  try {
    const data = await definition.execute({
      repository: definition.repository,
      runId: run.id,
      agentName: definition.agentName,
    });
    const completedRun = await definition.repository.completeAgentRun({
      runId: run.id,
      status: "completed",
      outputSummary: "Scheduled job completed successfully.",
      durationMs: Date.now() - startedAt,
    });
    return { run: completedRun, data };
  } catch (error) {
    await definition.repository.completeAgentRun({
      runId: run.id,
      status: "failed",
      errorCode: "scheduled_job_failed",
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}
