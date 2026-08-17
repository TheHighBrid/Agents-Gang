import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { saveAgentRun, saveApprovalRequest } from "../tools/database";

describe("database tool adapters", () => {
  test("persists an agent run through the governed repository", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: () => "run-1" });
    const run = await saveAgentRun(repository, {
      agentName: "shopify_ops_agent",
      provider: "anthropic",
      model: "claude-opus-4-8",
      routeAgent: "shopify_ops_agent",
      riskLevel: 1,
      inputSummary: "Audit the product page",
    });
    expect(run).toMatchObject({ id: "run-1", status: "running", agentName: "shopify_ops_agent" });
    await expect(repository.listAgentRuns()).resolves.toContainEqual(run);
  });

  test("persists an approval request through the governed repository", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: () => "approval-1" });
    const approval = await saveApprovalRequest(repository, {
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "shopify_product", id: "gid://shopify/Product/123" },
      riskLevel: 3,
      payloadSummary: "Update product description",
    });
    expect(approval).toMatchObject({ id: "approval-1", status: "pending", riskLevel: 3 });
    await expect(repository.listApprovals()).resolves.toContainEqual(approval);
  });
});
