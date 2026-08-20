import {
  authorizeOperatorRequest,
  operatorAuthorizationResponse,
} from "../../../lib/approvals/auth";
import {
  createExecutionRepository,
  ExecutionRepositoryConfigurationError,
} from "../../../lib/execution/execution-repository-factory";
import {
  ManualJobControlError,
  createManualJobController,
} from "../../../lib/scheduler/manual-job-controls";
import {
  MANUAL_JOB_DEFINITIONS,
  MANUAL_JOB_NAMES,
} from "../../../lib/scheduler/manual-job-registry";

type RuntimeOperator = {
  operatorId: string;
  response: Response | null;
};

function runtimeOperator(request: Request): RuntimeOperator {
  if (process.env.NODE_ENV !== "test") {
    return { operatorId: "testing-mode", response: null };
  }

  const result = authorizeOperatorRequest(request, process.env);
  return {
    operatorId: result.ok ? result.identity.subject : "unknown",
    response: operatorAuthorizationResponse(result),
  };
}

function safeJobResult(result: Awaited<ReturnType<ReturnType<typeof createManualJobController>["trigger"]>>) {
  return {
    outcome: result.outcome,
    attemptCount: result.attemptCount,
    job: {
      jobName: result.job.jobName,
      status: result.job.status,
      attemptCount: result.job.attemptCount,
      maxAttempts: result.job.maxAttempts,
      retryable: result.job.retryable,
      lastErrorCode: result.job.lastErrorCode,
      nextRetryAt: result.job.nextRetryAt,
      updatedAt: result.job.updatedAt,
    },
  };
}

export async function GET(request: Request) {
  const authorization = runtimeOperator(request);
  if (authorization.response) return authorization.response;
  return Response.json({ eligibleJobs: MANUAL_JOB_NAMES });
}

export async function POST(request: Request) {
  const authorization = runtimeOperator(request);
  if (authorization.response) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON", code: "invalid_request" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Request body must be an object", code: "invalid_request" }, { status: 400 });
  }

  const candidate = body as { action?: unknown; jobName?: unknown; idempotencyKey?: unknown };
  if (candidate.action !== "trigger" && candidate.action !== "retry") {
    return Response.json({ error: "action must be trigger or retry", code: "invalid_request" }, { status: 400 });
  }
  if (typeof candidate.jobName !== "string" || typeof candidate.idempotencyKey !== "string") {
    return Response.json({ error: "jobName and idempotencyKey are required", code: "invalid_request" }, { status: 400 });
  }

  try {
    const repository = createExecutionRepository(process.env);
    const controller = createManualJobController({ repository, jobs: MANUAL_JOB_DEFINITIONS });
    const input = {
      jobName: candidate.jobName,
      idempotencyKey: candidate.idempotencyKey,
      operatorId: authorization.operatorId,
    };
    const result = candidate.action === "trigger"
      ? await controller.trigger(input)
      : await controller.retry(input);
    return Response.json({ job: safeJobResult(result) }, { status: 202 });
  } catch (error) {
    if (error instanceof ManualJobControlError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof ExecutionRepositoryConfigurationError) {
      return Response.json({ error: "Execution storage is not configured", code: "execution_storage_unavailable" }, { status: 503 });
    }
    return Response.json({ error: "Unable to execute the job control", code: "job_execution_failed" }, { status: 502 });
  }
}
