import {
  careerAgentPrompt,
  conciergeAgentPrompt,
  creativeDirectorAgentPrompt,
  financeAgentPrompt,
  orchestratorPrompt,
  productPageAgentPrompt,
  shopifyOpsAgentPrompt,
  trendRadarAgentPrompt,
  visualQAAgentPrompt,
} from "../../../agents";
import { loadMemory } from "../../../memory/loadMemory";

type RoutePlan = {
  agent: string;
  risk_level: number;
  reason: string;
  needed_tools: string[];
  user_intent: string;
  approval_required: boolean;
};

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content: AnthropicTextBlock[];
};

const MAX_MESSAGE_LENGTH = 10_000;
const ANTHROPIC_TIMEOUT_MS = 30_000;

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
  ) {
    super(message);
  }
}

const agentPrompts: Record<string, string> = {
  product_page_agent: productPageAgentPrompt,
  creative_director_agent: creativeDirectorAgentPrompt,
  shopify_ops_agent: shopifyOpsAgentPrompt,
  visual_qa_agent: visualQAAgentPrompt,
  concierge_agent: conciergeAgentPrompt,
  trend_radar_agent: trendRadarAgentPrompt,
  finance_agent: financeAgentPrompt,
  career_agent: careerAgentPrompt,
  general_life_admin_agent: careerAgentPrompt,
};

function isRoutePlan(value: unknown): value is RoutePlan {
  if (!value || typeof value !== "object") {
    return false;
  }

  const route = value as Partial<RoutePlan>;

  return (
    typeof route.agent === "string" &&
    typeof route.risk_level === "number" &&
    route.risk_level >= 1 &&
    route.risk_level <= 4 &&
    typeof route.reason === "string" &&
    Array.isArray(route.needed_tools) &&
    route.needed_tools.every((tool) => typeof tool === "string") &&
    typeof route.user_intent === "string" &&
    typeof route.approval_required === "boolean" &&
    route.approval_required === (route.risk_level >= 3)
  );
}

async function createClaudeMessage(system: string, message: string, maxTokens: number) {
  let response: Response;

  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: message }],
      }),
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "AI provider request timed out"
      : "AI provider could not be reached";
    throw new UpstreamError(message, 503);
  }

  if (!response.ok) {
    throw new UpstreamError(`AI provider returned status ${response.status}`);
  }

  let payload: Partial<AnthropicResponse>;
  try {
    payload = (await response.json()) as Partial<AnthropicResponse>;
  } catch {
    throw new UpstreamError("AI provider returned malformed JSON");
  }

  if (
    !Array.isArray(payload.content) ||
    !payload.content.every(
      (block) => block && block.type === "text" && typeof block.text === "string",
    )
  ) {
    throw new UpstreamError("AI provider returned an invalid response");
  }

  return payload as AnthropicResponse;
}

function getTextContent(response: AnthropicResponse) {
  return response.content.find((block) => block.type === "text")?.text ?? "";
}

function parseRoutePlan(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1] ?? trimmed;

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    throw new UpstreamError("Orchestrator returned malformed routing data");
  }
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

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
    const routeResponse = await createClaudeMessage(orchestratorPrompt, message, 1000);
    const parsedRoute = parseRoutePlan(getTextContent(routeResponse));

    if (!isRoutePlan(parsedRoute)) {
      throw new UpstreamError("Orchestrator returned an invalid route");
    }

    const selectedPrompt = agentPrompts[parsedRoute.agent];

    if (!selectedPrompt) {
      throw new UpstreamError("Orchestrator selected an unknown agent");
    }

    const agentResponse = await createClaudeMessage(`${loadMemory()}\n\n${selectedPrompt}`, message, 4000);
    const output = getTextContent(agentResponse);
    if (!output) {
      throw new UpstreamError("Specialist agent returned an empty response");
    }

    return Response.json({ route: parsedRoute, output });
  } catch (error) {
    console.error("Chat request failed", error);
    const status = error instanceof UpstreamError ? error.status : 500;
    const message = error instanceof UpstreamError ? error.message : "An unexpected error occurred";
    return Response.json({ error: message }, { status });
  }
}
