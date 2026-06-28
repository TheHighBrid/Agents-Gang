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
    typeof route.approval_required === "boolean"
  );
}

async function createClaudeMessage(system: string, message: string, maxTokens: number) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-8",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: message }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  return (await response.json()) as AnthropicResponse;
}

function getTextContent(response: AnthropicResponse) {
  return response.content.find((block) => block.type === "text")?.text ?? "";
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  const body = (await req.json()) as { message?: unknown };

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return Response.json({ error: "Request body must include a non-empty message" }, { status: 400 });
  }

  const routeResponse = await createClaudeMessage(orchestratorPrompt, body.message, 1000);
  const routeText = getTextContent(routeResponse);
  const parsedRoute = JSON.parse(routeText) as unknown;

  if (!isRoutePlan(parsedRoute)) {
    return Response.json({ error: "Orchestrator returned an invalid route", routeText }, { status: 502 });
  }

  const selectedPrompt = agentPrompts[parsedRoute.agent];

  if (!selectedPrompt) {
    return Response.json({ error: "No valid agent selected", route: parsedRoute }, { status: 400 });
  }

  const agentResponse = await createClaudeMessage(`${loadMemory()}\n\n${selectedPrompt}`, body.message, 4000);

  return Response.json({
    route: parsedRoute,
    output: getTextContent(agentResponse),
  });
}
