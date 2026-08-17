import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { getDashboardSnapshotResponse } from "../lib/dashboard/dashboard-api";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("persisted operations dashboard contract", () => {
  test("returns deterministic payload-safe operational view models", async () => {
    let tick = 0;
    const repository = createInMemoryExecutionRepository({
      clock: () => new Date(Date.UTC(2026, 7, 17, 12, 0, tick++)),
      idFactory: (() => {
        let index = 0;
        return () => `record-${++index}`;
      })(),
    });

    const older = await repository.createAgentRun({
      agentName: "trend_radar_agent",
      provider: "anthropic",
      model: "claude-opus-4-8",
      routeAgent: "trend_radar_agent",
      riskLevel: 1,
      inputSummary: "private older input",
    });
    const newer = await repository.createAgentRun({
      agentName: "shopify_ops_agent",
      provider: "anthropic",
      model: "claude-opus-4-8",
      routeAgent: "shopify_ops_agent",
      riskLevel: 3,
      inputSummary: "private newer input",
    });
    await repository.completeAgentRun({
      runId: newer.id,
      status: "failed",
      outputSummary: "private output",
      errorCode: "transport_timeout",
      durationMs: 4200,
    });
    await repository.recordRoutingDecision({
      runId: newer.id,
      selectedAgent: "shopify_ops_agent",
      riskLevel: 3,
      reason: "Store operation requires Shopify route",
      neededTools: ["shopify.products.read"],
      approvalRequired: false,
    });
    await repository.recordToolCall({
      runId: newer.id,
      agentName: "shopify_ops_agent",
      toolName: "shopify.products.read",
      capability: "read",
      riskLevel: 3,
      outcome: "failed",
      errorCode: "transport_timeout",
    });
    await repository.recordAuditEvent({
      runId: newer.id,
      agentName: "shopify_ops_agent",
      toolName: "shopify.products.read",
      riskLevel: 3,
      eventType: "tool.failed",
      outcome: "failed",
      metadata: { secret: "must-not-cross-dashboard-boundary" },
    });
    await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "product", id: "gid://shopify/Product/1" },
      riskLevel: 4,
      payloadSummary: "private mutation payload",
    });

    const response = await getDashboardSnapshotResponse(repository);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.runs.map((run: { id: string }) => run.id)).toEqual([newer.id, older.id]);
    expect(body.runs[0]).toEqual(expect.objectContaining({
      id: newer.id,
      agentName: "shopify_ops_agent",
      status: "failed",
      riskLevel: 3,
      errorCode: "transport_timeout",
      durationMs: 4200,
    }));
    for (const unsafeField of ["provider", "model", "routeAgent", "inputSummary", "outputSummary"]) {
      expect(body.runs[0]).not.toHaveProperty(unsafeField);
    }
    expect(body.routingDecisions[0]).toEqual(expect.objectContaining({ runId: newer.id, selectedAgent: "shopify_ops_agent" }));
    expect(body.toolCalls[0]).toEqual(expect.objectContaining({ runId: newer.id, outcome: "failed", errorCode: "transport_timeout" }));
    expect(body.auditEvents[0]).not.toHaveProperty("metadata");
    expect(body.approvals[0]).toEqual(expect.objectContaining({ status: "pending", actionType: "shopify.product.update" }));
    expect(body.approvals[0]).not.toHaveProperty("payloadSummary");
  });

  test("renders triage controls, correlation, and explicit dashboard states", () => {
    const page = read("app/dashboard/page.tsx");
    expect(page).toContain("routingDecisions");
    expect(page).toContain("Needs attention");
    expect(page).toContain("All activity");
    expect(page).toContain("Pending approvals");
    expect(page).toContain("Failed runs");
    expect(page).toContain("Blocked actions");
    expect(page).toContain("Routing decisions");
    expect(page).toContain("Run ID");
    expect(page).toContain("role=\"alert\"");
    expect(page).toContain("aria-live=\"polite\"");
    expect(page).toContain("aria-busy={loading}");
  });
});
