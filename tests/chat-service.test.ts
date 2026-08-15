import { describe, expect, test } from "vitest";

import type { AIProvider } from "../lib/ai/contracts";
import { ChatServiceError, runChat } from "../lib/chat/chat-service";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";

function createProvider(responses: string[]): AIProvider {
  return {
    name: "test-provider",
    async generate() {
      const text = responses.shift();
      if (!text) {
        throw new Error("No response configured");
      }
      return { text, provider: "test-provider", model: "test-model" };
    },
  };
}

function validRoute() {
  return JSON.stringify({
    agent: "product_page_agent",
    risk_level: 1,
    reason: "The request is a product audit.",
    needed_tools: [],
    user_intent: "audit a product page",
    approval_required: false,
  });
}

describe("chat service", () => {
  test("rejects malformed orchestrator JSON before a specialist is called", async () => {
    const provider = createProvider(["not valid JSON"]);

    await expect(
      runChat({
        message: "Audit this product page",
        provider,
        loadMemory: () => "memory",
      }),
    ).rejects.toMatchObject({
      name: ChatServiceError.name,
      status: 502,
      message: "Orchestrator returned malformed routing data",
    });
  });

  test("rejects a route that selects an unknown agent", async () => {
    const provider = createProvider([
      JSON.stringify({
        agent: "unknown_agent",
        risk_level: 1,
        reason: "test",
        needed_tools: [],
        user_intent: "audit",
        approval_required: false,
      }),
    ]);

    await expect(
      runChat({
        message: "Audit this product page",
        provider,
        loadMemory: () => "memory",
      }),
    ).rejects.toMatchObject({
      name: ChatServiceError.name,
      status: 502,
      message: "Orchestrator selected an unknown agent",
    });
  });

  test("runs a valid route through the configured provider", async () => {
    const provider = createProvider([
      validRoute(),
      "# Product Page Audit\nThe product needs clearer fit guidance.",
    ]);

    await expect(
      runChat({
        message: "Audit this product page",
        provider,
        loadMemory: () => "brand memory",
      }),
    ).resolves.toMatchObject({
      route: {
        agent: "product_page_agent",
        risk_level: 1,
      },
      output: "# Product Page Audit\nThe product needs clearer fit guidance.",
      provider: "test-provider",
      model: "test-model",
    });
  });

  test("records the completed run and routing decision when a repository is provided", async () => {
    const repository = createInMemoryExecutionRepository({
      idFactory: (() => {
        let index = 0;
        return () => `record-${++index}`;
      })(),
      clock: () => new Date("2026-08-15T12:00:00.000Z"),
    });

    await runChat({
      message: "Audit this product page",
      provider: createProvider([validRoute(), "Audit complete."]),
      loadMemory: () => "brand memory",
      repository,
    });

    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      {
        id: "record-1",
        agentName: "product_page_agent",
        provider: "test-provider",
        model: "test-model",
        routeAgent: "product_page_agent",
        riskLevel: 1,
        status: "completed",
      },
    ]);
    await expect(repository.listRoutingDecisions()).resolves.toMatchObject([
      {
        runId: "record-1",
        selectedAgent: "product_page_agent",
        riskLevel: 1,
        approvalRequired: false,
      },
    ]);
  });
});


test("records a failed run when the specialist provider call fails", async () => {
  const repository = createInMemoryExecutionRepository({
    idFactory: (() => {
      let index = 0;
      return () => `record-${++index}`;
    })(),
    clock: () => new Date("2026-08-15T12:00:00.000Z"),
  });
  let calls = 0;
  const provider: AIProvider = {
    name: "test-provider",
    async generate() {
      calls += 1;
      if (calls === 1) {
        return { text: validRoute(), provider: "test-provider", model: "test-model" };
      }
      throw new Error("Provider connection failed");
    },
  };

  await expect(
    runChat({
      message: "Audit this product page",
      provider,
      loadMemory: () => "brand memory",
      repository,
    }),
  ).rejects.toThrow("Provider connection failed");

  await expect(repository.listAgentRuns()).resolves.toMatchObject([
    {
      id: "record-1",
      status: "failed",
      errorCode: "chat_execution_failed",
    },
  ]);
});
