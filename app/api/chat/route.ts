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

export async function POST(req: Request) {
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  const configuredProvider = process.env.AI_PROVIDER ?? "anthropic";
  const logger = createStructuredLogger();

  let body: { message?: unknown };
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return Response.json({ error: "Request body must include a non-empty message" }, { status: 400 });
  }

  const message = body.message.trim();
  if (message.length > MAX_MESSAGE_LENGTH) {
    return Response.json(
      { error: `Message must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer` },
      { status: 413 },
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
    });
    logger.record({
      event: "chat.request.completed",
      runId,
      agent: result.route.agent,
      route: result.route.agent,
      provider: result.provider,
      riskLevel: result.route.risk_level,
      durationMs: Date.now() - startedAt,
      outcome: "succeeded",
    });

    return Response.json({
      route: result.route,
      output: result.output,
      provider: result.provider,
      model: result.model,
    });
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
      durationMs: Date.now() - startedAt,
      outcome: "failed",
    });

    return Response.json({ error: message }, { status });
  }
}
