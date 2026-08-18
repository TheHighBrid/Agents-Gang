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
import { resolveCorrelationId } from "../../../lib/observability/correlation";
import { createStructuredLogger } from "../../../lib/observability/structured-logger";
import { loadMemory } from "../../../memory/loadMemory";

const MAX_MESSAGE_LENGTH = 10_000;

function jsonResponse(body: Record<string, unknown>, status: number, correlationId: string) {
  return Response.json(body, {
    status,
    headers: { "x-correlation-id": correlationId },
  });
}

export async function POST(req: Request) {
  const correlationId = resolveCorrelationId(req);
  const startedAt = Date.now();
  const configuredProvider = process.env.AI_PROVIDER ?? "anthropic";
  const logger = createStructuredLogger();

  let body: { message?: unknown };
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON" }, 400, correlationId);
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return jsonResponse({ error: "Request body must include a non-empty message" }, 400, correlationId);
  }

  const message = body.message.trim();
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(
      { error: `Message must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer` },
      413,
      correlationId,
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
      correlationId: result.correlationId,
      runId: result.runId,
      agent: result.route.agent,
      route: result.route.agent,
      provider: result.provider,
      riskLevel: result.route.risk_level,
      durationMs: Date.now() - startedAt,
      outcome: "succeeded",
    });

    return jsonResponse({
      route: result.route,
      output: result.output,
      provider: result.provider,
      model: result.model,
    }, 200, result.correlationId);
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
      correlationId,
      provider: configuredProvider,
      durationMs: Date.now() - startedAt,
      outcome: "failed",
    });

    return jsonResponse({ error: message }, status, correlationId);
  }
}
