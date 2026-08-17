import {
  ManualJobControlError,
  authorizeOperatorRequest,
} from "../../../lib/scheduler/manual-job-controls";
import { createStructuredLogger } from "../../../lib/observability/structured-logger";
import { createProtectedJobController } from "../../../lib/scheduler/protected-job-controller";

const MAX_CORRELATION_ID_LENGTH = 128;

function resolveCorrelationId(request: Request) {
  const supplied = request.headers.get("x-correlation-id")?.trim();
  return supplied && /^[A-Za-z0-9._:-]+$/.test(supplied) && supplied.length <= MAX_CORRELATION_ID_LENGTH
    ? supplied
    : crypto.randomUUID();
}

function response(body: Record<string, unknown>, status: number, correlationId: string) {
  return Response.json(body, { status, headers: { "x-correlation-id": correlationId } });
}

export async function POST(request: Request) {
  const correlationId = resolveCorrelationId(request);
  const logger = createStructuredLogger();
  try {
    const operator = authorizeOperatorRequest(request, {
      OPERATOR_CONTROL_TOKEN: process.env.OPERATOR_CONTROL_TOKEN,
    });
    let body: {
      action?: unknown;
      jobName?: unknown;
      idempotencyKey?: unknown;
      failedRunId?: unknown;
    };
    try {
      body = await request.json() as typeof body;
    } catch {
      return response({ error: "Request body must be valid JSON", code: "invalid_request" }, 400, correlationId);
    }

    if (body.action !== "trigger" && body.action !== "retry") {
      return response({ error: "action must be trigger or retry", code: "invalid_request" }, 400, correlationId);
    }
    if (typeof body.jobName !== "string" || typeof body.idempotencyKey !== "string") {
      return response({ error: "jobName and idempotencyKey are required", code: "invalid_request" }, 400, correlationId);
    }
    if (body.action === "retry" && typeof body.failedRunId !== "string") {
      return response({ error: "failedRunId is required for retry requests", code: "invalid_request" }, 400, correlationId);
    }

    const controller = createProtectedJobController();
    const input = {
      jobName: body.jobName,
      idempotencyKey: body.idempotencyKey,
      operatorId: operator.id,
      correlationId,
    };
    const job = body.action === "trigger"
      ? await controller.trigger(input)
      : await controller.retry({ ...input, failedRunId: body.failedRunId as string });
    return response({ job, correlationId }, job.duplicate ? 200 : 202, correlationId);
  } catch (error) {
    if (error instanceof ManualJobControlError) {
      logger.record({
        event: "operator_control.rejected",
        correlationId,
        outcome: "blocked",
      });
      return response({ error: error.message, code: error.code }, error.status, correlationId);
    }
    logger.record({
      event: "operator_control.failed",
      correlationId,
      outcome: "failed",
    });
    return response({ error: "Unable to process the protected job request", code: "operator_control_failed" }, 500, correlationId);
  }
}
