import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { GET as getDashboardRoute } from "../app/api/dashboard/route";
import { createFounderSessionToken, resolveFounderIdentity } from "../lib/approvals/auth";
import { getDashboardSnapshotResponse } from "../lib/dashboard/dashboard-api";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { defineTool, executeTool } from "../lib/execution/tool-execution";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

type TargetInput = { targetId: string };

const readTool = defineTool({
  name: "shopify.products.read",
  capability: "read",
  riskLevel: 1,
  parseInput: () => ({}),
  execute: async () => ({ products: 1 }),
});

const draftTool = defineTool<TargetInput, { draftId: string }>({
  name: "gmail.draft.create",
  capability: "draft",
  riskLevel: 3,
  parseInput(input) {
    if (!input || typeof input !== "object" || typeof (input as TargetInput).targetId !== "string") {
      throw new Error("targetId is required");
    }
    return input as TargetInput;
  },
  getTarget: (input) => ({ type: "gmail-draft-payload", id: input.targetId }),
  execute: async () => ({ draftId: "sandbox-draft-1" }),
});

function mutationTool({ fail = false }: { fail?: boolean } = {}) {
  return defineTool<TargetInput, { updated: true }>({
    name: "shopify.product.update",
    capability: "execute",
    riskLevel: 3,
    parseInput(input) {
      if (!input || typeof input !== "object" || typeof (input as TargetInput).targetId !== "string") {
        throw new Error("targetId is required");
      }
      return input as TargetInput;
    },
    getTarget: (input) => ({ type: "product", id: input.targetId }),
    execute: async () => {
      if (fail) {
        throw Object.assign(new Error("Sandbox transport timed out"), {
          code: "shopify_timeout",
          retriable: true,
        });
      }
      return { updated: true as const };
    },
  });
}

describe("founder workflow acceptance", () => {
  test("automates the governed sandbox journey without bypassing authorization", async () => {
    let tick = 0;
    let id = 0;
    const repository = createInMemoryExecutionRepository({
      clock: () => new Date(Date.UTC(2026, 7, 17, 12, 0, tick++)),
      idFactory: () => `acceptance-${++id}`,
    });

    const run = await repository.createAgentRun({
      agentName: "shopify_ops_agent",
      provider: "sandbox",
      model: "acceptance-fixture",
      routeAgent: "shopify_ops_agent",
      riskLevel: 3,
      inputSummary: "private sandbox founder request",
    });
    await repository.recordRoutingDecision({
      runId: run.id,
      selectedAgent: "shopify_ops_agent",
      riskLevel: 3,
      reason: "private sandbox routing rationale",
      neededTools: ["shopify.products.read", "gmail.draft.create", "shopify.product.update"],
      approvalRequired: true,
    });

    const readResult = await executeTool({ repository, runId: run.id, agentName: "shopify_ops_agent" }, readTool, {});
    expect(readResult).toEqual({ ok: true, data: { products: 1 } });

    const draftApproval = await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "gmail.draft.create",
      target: { type: "gmail-draft-payload", id: "draft-digest-1" },
      riskLevel: 3,
      payloadSummary: "private sandbox draft payload summary",
    });
    const blockedDraft = await executeTool(
      { repository, runId: run.id, agentName: "shopify_ops_agent" },
      draftTool,
      { targetId: "draft-digest-1" },
    );
    expect(blockedDraft).toMatchObject({ ok: false, error: { code: "approval_required" } });

    await repository.decideApproval({ approvalId: draftApproval.id, status: "approved", result: "Sandbox approval" });
    const approvedDraft = await executeTool(
      { repository, runId: run.id, agentName: "shopify_ops_agent", approvalId: draftApproval.id },
      draftTool,
      { targetId: "draft-digest-1" },
    );
    expect(approvedDraft).toEqual({ ok: true, data: { draftId: "sandbox-draft-1" } });
    expect((await repository.getApproval(draftApproval.id))?.status).toBe("consumed");

    const replay = await executeTool(
      { repository, runId: run.id, agentName: "shopify_ops_agent", approvalId: draftApproval.id },
      draftTool,
      { targetId: "draft-digest-1" },
    );
    expect(replay).toMatchObject({ ok: false, error: { code: "approval_not_approved" } });

    const rejectedApproval = await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "product", id: "sandbox-product-rejected" },
      riskLevel: 3,
      payloadSummary: "private rejected mutation summary",
    });
    await repository.decideApproval({ approvalId: rejectedApproval.id, status: "rejected", result: "Sandbox rejection" });
    const rejectedMutation = await executeTool(
      { repository, runId: run.id, agentName: "shopify_ops_agent", approvalId: rejectedApproval.id },
      mutationTool(),
      { targetId: "sandbox-product-rejected" },
    );
    expect(rejectedMutation).toMatchObject({ ok: false, error: { code: "approval_not_approved" } });

    const failureApproval = await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "product", id: "sandbox-product-timeout" },
      riskLevel: 3,
      payloadSummary: "private failing mutation summary",
    });
    await repository.decideApproval({ approvalId: failureApproval.id, status: "approved", result: "Sandbox failure-path approval" });
    const failedMutation = await executeTool(
      { repository, runId: run.id, agentName: "shopify_ops_agent", approvalId: failureApproval.id },
      mutationTool({ fail: true }),
      { targetId: "sandbox-product-timeout" },
    );
    expect(failedMutation).toMatchObject({ ok: false, error: { code: "tool_execution_failed", retriable: true } });
    expect((await repository.getApproval(failureApproval.id))?.status).toBe("consumed");

    await repository.completeAgentRun({
      runId: run.id,
      status: "failed",
      errorCode: "sandbox_external_failure",
      durationMs: 125,
    });

    const dashboardResponse = await getDashboardSnapshotResponse(repository);
    const dashboard = await dashboardResponse.json();
    expect(dashboard.runs[0]).toMatchObject({ id: run.id, status: "failed", errorCode: "sandbox_external_failure" });
    expect(dashboard.routingDecisions[0].runId).toBe(run.id);
    expect(dashboard.toolCalls.some((call: { errorCode?: string }) => call.errorCode === "shopify_timeout")).toBe(true);
    expect(dashboard.auditEvents.some((event: { runId?: string; outcome: string }) => event.runId === run.id && event.outcome === "failed")).toBe(true);
    expect(dashboard.approvals.every((approval: object) => !("payloadSummary" in approval) && !("result" in approval))).toBe(true);
    expect(dashboard.auditEvents.every((event: object) => !("metadata" in event))).toBe(true);
    expect(dashboard.runs.every((item: object) => !("inputSummary" in item) && !("outputSummary" in item))).toBe(true);
    expect(dashboard.routingDecisions[0].reason).not.toContain("private sandbox routing rationale");

    const secret = "acceptance-founder-secret";
    const now = 1_700_000_000;
    const anonymous = new Request("https://example.test/api/dashboard", { headers: { "x-user-role": "founder" } });
    expect(resolveFounderIdentity(anonymous, secret, { now })).toEqual({ ok: false, reason: "unauthorized" });
    const token = createFounderSessionToken({
      subject: "founder-acceptance",
      role: "founder",
      sessionId: "acceptance-session",
      issuedAt: now - 60,
      expiresAt: now + 900,
    }, secret);
    const authenticated = new Request("https://example.test/api/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resolveFounderIdentity(authenticated, secret, { now })).toMatchObject({ ok: true, identity: { role: "founder" } });
  });

  test("enforces the signed founder boundary on the actual dashboard route", async () => {
    const previousSecret = process.env.FOUNDER_AUTH_SECRET;
    const previousRevocations = process.env.FOUNDER_REVOKED_SESSION_IDS;
    const previousSupabaseUrl = process.env.SUPABASE_URL;
    const previousSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const secret = "acceptance-route-founder-secret";

    try {
      process.env.FOUNDER_AUTH_SECRET = secret;
      delete process.env.FOUNDER_REVOKED_SESSION_IDS;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const spoofed = await getDashboardRoute(new Request("https://example.test/api/dashboard", {
        headers: { "x-user-role": "founder" },
      }));
      expect(spoofed.status).toBe(401);
      await expect(spoofed.json()).resolves.toEqual({ error: "Founder authentication required" });

      const now = Math.floor(Date.now() / 1000);
      const token = createFounderSessionToken({
        subject: "founder-route-acceptance",
        role: "founder",
        sessionId: "route-acceptance-session",
        issuedAt: now - 60,
        expiresAt: now + 900,
      }, secret);
      const signed = await getDashboardRoute(new Request("https://example.test/api/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      }));
      expect(signed.status).toBe(503);
      await expect(signed.json()).resolves.toEqual({ error: "Execution storage is not configured" });
    } finally {
      if (previousSecret === undefined) delete process.env.FOUNDER_AUTH_SECRET;
      else process.env.FOUNDER_AUTH_SECRET = previousSecret;
      if (previousRevocations === undefined) delete process.env.FOUNDER_REVOKED_SESSION_IDS;
      else process.env.FOUNDER_REVOKED_SESSION_IDS = previousRevocations;
      if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousSupabaseUrl;
      if (previousSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseKey;
    }
  });

  test("provides a founder-readable script and release evidence contract", () => {
    const script = read("docs/FOUNDER_WORKFLOW_ACCEPTANCE.md");
    for (const required of [
      "Sandbox/test data only",
      "Signed founder session",
      "Read workflow",
      "Draft workflow",
      "Prepared high-risk action",
      "Approve path",
      "Reject path",
      "Replay block",
      "External failure",
      "Audit inspection",
      "Evidence capture",
      "RC-05",
      "Do not call repository methods directly",
    ]) {
      expect(script).toContain(required);
    }

    const register = read("docs/RELEASE_EVIDENCE_REGISTER.md");
    expect(register).toContain("EV-C2-04-01");
    expect(register).toContain("FOUNDER_WORKFLOW_ACCEPTANCE.md");
  });
});
