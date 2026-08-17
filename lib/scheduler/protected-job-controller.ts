import { runDailyMelatoAudit } from "../../jobs/dailyMelatoAudit";
import { createExecutionRepository } from "../execution/execution-repository-factory";
import { createManualJobController, type ManualJobDefinition } from "./manual-job-controls";

function createEligibleManualJobs(): ManualJobDefinition[] {
  return [
    {
      name: "daily-melato-audit",
      run({ repository, idempotencyKey, correlationId }) {
        return runDailyMelatoAudit(repository, undefined, { idempotencyKey, correlationId });
      },
    },
  ];
}

export function createProtectedJobController(env: NodeJS.ProcessEnv = process.env) {
  return createManualJobController({
    repository: createExecutionRepository(env),
    jobs: createEligibleManualJobs(),
  });
}
