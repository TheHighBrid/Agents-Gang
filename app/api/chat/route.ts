import {
  AIProviderConfigurationError,
  AIProviderError,
} from "../../../lib/ai/contracts";
import { createAIProvider } from "../../../lib/ai/provider-factory";
import { ChatServiceError, runChat } from "../../../lib/chat/chat-service";
import {
  createExecutionRepository,
  ExecutionRepositoryConfigurationError,
} from "../../../lib/execution/execution-repository-factory";
import { createStructuredLogger } from "../../../lib/observability/structured-logger";
import { loadMemory } from "../../../memory/loadMemory";

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_CORRELATION_ID_LENGTH = 128;

function resolveCorrelationId(req: Request) {
  const supplied = req.headers.get("x-correlation-id")?.trim();
  return supplied && /^[A-Za-z0-9._:-]+$/.test(supplied) && supplied.length <= MAX_CORRELATION_ID_LENGTH
    ? supplied
    : crypto.randomUUID();
}

function correlationHeaders(correlationId: string) {
  return { "x-correlation-id": correlationId };
}

export async function POST(req: Request) {
  const correlationId = resolveCorrelationId(req);
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  const configuredProvider = process.env.AI_PROVIDER ?? "anthropic";
  const logger = createStructuredLogger();

  let body: { message?: unknown };
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON", correlationId },
      { status: 400, headers: correlationHeaders(correlationId) },
    );
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return Response.json(
      { error: "Request body must include a non-empty message", correlationId },
      { status: 400, headers: correlationHeaders(correlationId) },
    );
  }

  const message = body.message.trim();
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json(
      { error: `Message must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer`, correlationId },
      { status: 413, headers: correlationHeaders(correlationId) },
    );
  }

  try {
    const provider = createAIProvider(process.env);
    const repository = createExecutionRepository(process.env);
    const result = await runChat({
      message,
      provider,
      loadMemory,
      repository,
      correlationId,
    });
    logger.record({
      event: "chat.request.completed",
      runId,
      agent: result.route.agent,
      route: result.route.agent,
      provider: result.provider,
      riskLevel: result.route.risk_level,
      correlationId,
      durationMs: Date.now() - startedAt,
      outcome: "succeeded",
    });

    return Response.json({
      route: result.route,
      output: result.output,
      provider: result.provider,
      model: result.model,
      correlationId,
    }, { headers: correlationHeaders(correlationId) });
  } catch (error) {
    const status = error instanceof AIProviderError ||
      error instanceof AIProviderConfigurationError ||
      error instanceof ExecutionRepositoryConfigurationError ||
      error instanceof ChatServiceError
      ? error.status
      : 500;
    const message = error instanceof AIProviderError ||
      error instanceof AIProviderConfigurationError ||
      error instanceof ExecutionRepositoryConfigurationError ||
      error instanceof ChatServiceError
      ? error.message
      : "An unexpected error occurred";

    logger.record({
      event: "chat.request.failed",
      runId,
      provider: configuredProvider,
      correlationId,
      durationMs: Date.now() - startedAt,
      outcome: "failed",
    });

    return Response.json(
      { error: message, correlationId },
      { status, headers: correlationHeaders(correlationId) },
    );
  }
}
