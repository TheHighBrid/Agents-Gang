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
} from "../../agents";
import type { AIProvider } from "../ai/contracts";
import type { RiskLevel } from "../execution/approval-engine";
import type { ExecutionRepository } from "../execution/repository";

export type RoutePlan = {
  agent: string;
  risk_level: RiskLevel;
  reason: string;
  needed_tools: string[];
  user_intent: string;
  approval_required: boolean;
};

export class ChatServiceError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
  ) {
    super(message);
    this.name = "ChatServiceError";
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
    Number.isInteger(route.risk_level) &&
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

function parseRoutePlan(text: string): RoutePlan {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1] ?? trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate) as unknown;
  } catch {
    throw new ChatServiceError("Orchestrator returned malformed routing data");
  }

  if (!isRoutePlan(parsed)) {
    throw new ChatServiceError("Orchestrator returned an invalid route");
  }

  return parsed;
}

export async function runChat({
  message,
  provider,
  loadMemory,
  repository,
  correlationId,
}: {
  message: string;
  provider: AIProvider;
  loadMemory: () => string;
  repository?: ExecutionRepository;
  correlationId?: string;
}): Promise<{
  route: RoutePlan;
  output: string;
  provider: string;
  model: string;
}> {
  const startedAt = Date.now();
  const routeResponse = await provider.generate({
    system: orchestratorPrompt,
    userMessage: message,
    maxTokens: 1000,
  });
  const route = parseRoutePlan(routeResponse.text);
  const selectedPrompt = agentPrompts[route.agent];
  if (!selectedPrompt) {
    throw new ChatServiceError("Orchestrator selected an unknown agent");
  }

  const run = await repository?.createAgentRun({
    agentName: route.agent,
    provider: routeResponse.provider,
    model: routeResponse.model,
    routeAgent: route.agent,
    riskLevel: route.risk_level,
    inputSummary: `Chat request received (${message.length} characters).`,
    correlationId,
  });
  if (run) {
    await repository?.recordRoutingDecision({
      runId: run.id,
      selectedAgent: route.agent,
      riskLevel: route.risk_level,
      reason: route.reason,
      neededTools: route.needed_tools,
      approvalRequired: route.approval_required,
      correlationId,
    });
  }

  try {
    const specialistResponse = await provider.generate({
      system: `${loadMemory()}\n\n${selectedPrompt}`,
      userMessage: message,
      maxTokens: 4000,
    });
    if (!specialistResponse.text.trim()) {
      throw new ChatServiceError("Specialist agent returned an empty response");
    }

    if (run) {
      await repository?.completeAgentRun({
        runId: run.id,
        status: "completed",
        outputSummary: `Specialist response completed (${specialistResponse.text.length} characters).`,
        durationMs: Date.now() - startedAt,
      });
      await repository?.recordAuditEvent({
        runId: run.id,
        agentName: route.agent,
        correlationId,
        eventType: "agent.run.completed",
        outcome: "succeeded",
        metadata: { durationMs: Date.now() - startedAt },
      });
    }

    return {
      route,
      output: specialistResponse.text,
      provider: specialistResponse.provider,
      model: specialistResponse.model,
    };
  } catch (error) {
    if (run) {
      await repository?.completeAgentRun({
        runId: run.id,
        status: "failed",
        errorCode: "chat_execution_failed",
        durationMs: Date.now() - startedAt,
      });
      await repository?.recordAuditEvent({
        runId: run.id,
        agentName: route.agent,
        correlationId,
        eventType: "agent.run.failed",
        outcome: "failed",
        metadata: { errorCode: "chat_execution_failed" },
      });
    }
    throw error;
  }
}
