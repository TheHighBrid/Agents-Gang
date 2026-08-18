import type { ExecutionRepository, ScheduledJobRecord } from "../lib/execution/repository";

export const SCHEDULED_JOB_CANCELLED_CODE = "scheduled_job_cancelled";

export async function cancelClaimedScheduledJob({
  repository,
  job,
}: {
  repository: ExecutionRepository;
  job: ScheduledJobRecord;
}): Promise<ScheduledJobRecord> {
  if (job.status !== "running") {
    throw new Error("Only a claimed running scheduled job can be cancelled before execution");
  }

  return repository.completeScheduledJob({
    jobId: job.id,
    status: "failed",
    retryable: false,
    lastErrorCode: SCHEDULED_JOB_CANCELLED_CODE,
  });
}
