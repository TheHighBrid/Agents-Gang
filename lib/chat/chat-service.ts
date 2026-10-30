import { classifyTask, selectAgent, type ImprovementStore } from "../improvement/kernel.mjs";
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
import { createCorrelationId } from "../observability/correlation";

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

async function runChatCore({
  message,
  provider,
  loadMemory,
  repository,
  correlationId: suppliedCorrelationId,
  onRoute,
  repairRoute = false,
  onRouteFailure,
}: {
  message: string;
  provider: AIProvider;
  loadMemory: () => string;
  repository?: ExecutionRepository;
  correlationId?: string;
  onRoute?: (route: RoutePlan) => RoutePlan;
  repairRoute?: boolean;
  onRouteFailure?: () => void;
}): Promise<{
  route: RoutePlan;
  output: string;
  provider: string;
  model: string;
  correlationId: string;
  runId?: string;
}> {
  const startedAt = Date.now();
  const correlationId = createCorrelationId(suppliedCorrelationId);
  const request = { system: orchestratorPrompt, userMessage: message, maxTokens: 1000 };
  let routeResponse = await provider.generate(request);
  const validatedRoute = (text: string) => {
    const route = parseRoutePlan(text);
    if (!agentPrompts[route.agent]) throw new ChatServiceError("Orchestrator selected an unknown agent");
    return route;
  };
  let route: RoutePlan;
  try { route = validatedRoute(routeResponse.text); }
  catch (error) {
    if (!repairRoute || !(error instanceof ChatServiceError)) throw error;
    onRouteFailure?.();
    // One bounded text-only repair. Invalid model output is never injected as instructions.
    routeResponse = await provider.generate({ ...request,
      system: `${orchestratorPrompt}\nReturn exactly one valid JSON object matching the schema. Use an agent from the available list. approval_required must equal (risk_level >= 3).`,
    });
    route = validatedRoute(routeResponse.text);
  }
  route = onRoute?.(route) ?? route;
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
  });
  if (run && repository) {
    await repository.recordAuditEvent({
      runId: run.id,
      agentName: route.agent,
      eventType: "run.correlation",
      outcome: "succeeded",
      metadata: { correlationId },
    });
    await repository.recordRoutingDecision({
      runId: run.id,
      selectedAgent: route.agent,
      riskLevel: route.risk_level,
      reason: route.reason,
      neededTools: route.needed_tools,
      approvalRequired: route.approval_required,
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

    if (run && repository) {
      await repository.completeAgentRun({
        runId: run.id,
        status: "completed",
        outputSummary: `Specialist response completed (${specialistResponse.text.length} characters).`,
        durationMs: Date.now() - startedAt,
      });
    }

    return {
      route,
      output: specialistResponse.text,
      provider: specialistResponse.provider,
      model: specialistResponse.model,
      correlationId,
      ...(run ? { runId: run.id } : {}),
    };
  } catch (error) {
    if (run && repository) {
      await repository.completeAgentRun({
        runId: run.id,
        status: "failed",
        errorCode: "chat_execution_failed",
        durationMs: Date.now() - startedAt,
      });
    }
    throw error;
  }
}


/** Observe all provider attempts; learned config may change ONLY the specialist name. */
export async function runChat(input: Omit<Parameters<typeof runChatCore>[0], "onRoute" | "repairRoute" | "onRouteFailure"> & {
  improvementStore?: ImprovementStore;
}) {
  const store = input.improvementStore;
  if (!store) return runChatCore(input);
  let snapshot;
  try { snapshot = await store.read(); }
  catch {
    console.warn(JSON.stringify({ event: "improvement.storage.unavailable", outcome: "blocked" }));
    return runChatCore(input);
  }
  const champion = snapshot.champion;
  const category = classifyTask(input.message);
  const startedAt = Date.now();
  let providerCalls = 0;
  let repairedRoute = false;
  let suggestedAgent: string | undefined;
  let selectedAgent: string | undefined;
  const provider: AIProvider = {
    name: input.provider.name,
    generate(request) { providerCalls++; return input.provider.generate(request); },
  };
  const record = async (status: "completed" | "failed", failureCode?: string) => {
    try {
      return await store.record({ category, version: champion.id, suggestedAgent, selectedAgent,
        status, failureCode, durationMs: Date.now() - startedAt, providerCalls });
    } catch {
      console.warn(JSON.stringify({ event: "improvement.trace.unavailable", outcome: "failed" }));
      return undefined;
    }
  };
  try {
    const result = await runChatCore({ ...input, provider, repairRoute: true,
      onRouteFailure() { repairedRoute = true; }, onRoute(route) {
      suggestedAgent = route.agent;
      selectedAgent = selectAgent(champion, category, route.agent);
      return { ...route, agent: selectedAgent, ...(selectedAgent !== suggestedAgent ? { reason: `Verified routing correction (${champion.id}).` } : {}) };
    } });
    const attempt = await record("completed", repairedRoute ? "route_invalid" : undefined);
    return { ...result, ...(attempt ? { learningAttemptId: attempt.id } : {}) };
  } catch (error) {
    let failureCode = "execution_failed";
    if (error instanceof ChatServiceError) {
      if (error.message.includes("unknown agent")) failureCode = "route_unknown_agent";
      else if (error.message.includes("empty response")) failureCode = "empty_response";
      else failureCode = "route_invalid";
    } else if (error && typeof error === "object" && "code" in error &&
      ["provider_timeout", "provider_unavailable", "provider_invalid_response"].includes(String(error.code))) {
      failureCode = String(error.code);
    }
    await record("failed", failureCode);
    throw error;
  }
}
