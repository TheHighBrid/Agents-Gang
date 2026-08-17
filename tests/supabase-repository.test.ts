import { describe, expect, test } from "vitest";

import { createSupabaseExecutionRepository } from "../lib/execution/supabase-repository";

describe("Supabase execution repository", () => {
  test("persists an approval request using the declared approval schema", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const repository = createSupabaseExecutionRepository({
      url: "https://project.supabase.co",
      serviceRoleKey: "service-role-secret",
      request: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(
          JSON.stringify([
            {
              id: "approval-1",
              agent_name: "shopify_ops_agent",
              action_type: "shopify.product.update",
              target_type: "shopify_product",
              target_id: "gid://shopify/Product/123",
              risk_level: 3,
              payload_summary: "Update product description.",
              status: "pending",
              created_at: "2026-08-15T12:00:00.000Z",
              updated_at: "2026-08-15T12:00:00.000Z",
            },
          ]),
          { status: 201 },
        );
      },
    });

    const approval = await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "shopify_product", id: "gid://shopify/Product/123" },
      riskLevel: 3,
      payloadSummary: "Update product description.",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://project.supabase.co/rest/v1/approval_requests");
    expect(requests[0].init?.headers).toMatchObject({
      Authorization: "Bearer service-role-secret",
      Prefer: "return=representation",
    });
    expect(JSON.parse(requests[0].init?.body as string)).toEqual({
      agent_name: "shopify_ops_agent",
      action_type: "shopify.product.update",
      target_type: "shopify_product",
      target_id: "gid://shopify/Product/123",
      risk_level: 3,
      payload_summary: "Update product description.",
    });
    expect(approval).toMatchObject({
      id: "approval-1",
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      status: "pending",
    });
  });
});


test("persists an agent run using the declared execution schema", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = createSupabaseExecutionRepository({
    url: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    request: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(
        JSON.stringify([
          {
            id: "run-1",
            agent_name: "product_page_agent",
            provider: "anthropic",
            model: "claude-test",
            route_agent: "product_page_agent",
            risk_level: 1,
            status: "running",
            created_at: "2026-08-15T12:00:00.000Z",
            input_summary: "Chat request received (24 characters).",
          },
        ]),
        { status: 201 },
      );
    },
  });

  const run = await repository.createAgentRun({
    agentName: "product_page_agent",
    provider: "anthropic",
    model: "claude-test",
    routeAgent: "product_page_agent",
    riskLevel: 1,
    inputSummary: "Chat request received (24 characters).",
  });

  expect(requests[0].url).toBe("https://project.supabase.co/rest/v1/agent_runs");
  expect(JSON.parse(requests[0].init?.body as string)).toMatchObject({
    agent_name: "product_page_agent",
    provider: "anthropic",
    model: "claude-test",
    route_agent: "product_page_agent",
    risk_level: 1,
    input_summary: "Chat request received (24 characters).",
  });
  expect(run).toMatchObject({ id: "run-1", status: "running" });
});


test("lists agent runs newest-first and maps completion details", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = createSupabaseExecutionRepository({
    url: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    request: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify([{
        id: "run-2", agent_name: "shopify_ops_agent", provider: "anthropic", model: "claude-test",
        route_agent: "shopify_ops_agent", risk_level: 3, status: "completed", created_at: "2026-08-17T12:00:00.000Z",
        completed_at: "2026-08-17T12:01:00.000Z", input_summary: "Update a product.", output_summary: "Prepared update.",
        error_code: null, duration_ms: 60000,
      }]), { status: 200 });
    },
  });

  await expect(repository.listAgentRuns()).resolves.toEqual([{
    id: "run-2", agentName: "shopify_ops_agent", provider: "anthropic", model: "claude-test", routeAgent: "shopify_ops_agent",
    riskLevel: 3, status: "completed", createdAt: "2026-08-17T12:00:00.000Z", completedAt: "2026-08-17T12:01:00.000Z",
    inputSummary: "Update a product.", outputSummary: "Prepared update.", durationMs: 60000,
  }]);
  expect(requests[0]).toMatchObject({ url: "https://project.supabase.co/rest/v1/agent_runs?select=*&order=created_at.desc", init: { method: "GET" } });
});

test("lists routing decisions newest-first and maps governance policy", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = createSupabaseExecutionRepository({
    url: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    request: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify([{
        id: "route-1", run_id: "run-2", selected_agent: "shopify_ops_agent", risk_level: 3,
        reason: "Requires a product update.", needed_tools: ["shopify.product.update"], approval_required: true,
        created_at: "2026-08-17T12:00:01.000Z",
      }]), { status: 200 });
    },
  });

  await expect(repository.listRoutingDecisions()).resolves.toEqual([{
    id: "route-1", runId: "run-2", selectedAgent: "shopify_ops_agent", riskLevel: 3,
    reason: "Requires a product update.", neededTools: ["shopify.product.update"], approvalRequired: true,
    createdAt: "2026-08-17T12:00:01.000Z",
  }]);
  expect(requests[0]).toMatchObject({ url: "https://project.supabase.co/rest/v1/routing_decisions?select=*&order=created_at.desc", init: { method: "GET" } });
});

test("lists audit events newest-first and maps nullable event references", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = createSupabaseExecutionRepository({
    url: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    request: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify([{
        id: "audit-1", run_id: "run-2", agent_name: "shopify_ops_agent", tool_name: "shopify.product.update",
        risk_level: 3, approval_id: null, event_type: "tool_blocked", outcome: "blocked", metadata: { reason: "approval_required" },
        created_at: "2026-08-17T12:00:02.000Z",
      }]), { status: 200 });
    },
  });

  await expect(repository.listAuditEvents()).resolves.toEqual([{
    id: "audit-1", runId: "run-2", agentName: "shopify_ops_agent", toolName: "shopify.product.update", riskLevel: 3,
    eventType: "tool_blocked", outcome: "blocked", metadata: { reason: "approval_required" }, createdAt: "2026-08-17T12:00:02.000Z",
  }]);
  expect(requests[0]).toMatchObject({ url: "https://project.supabase.co/rest/v1/audit_events?select=*&order=created_at.desc", init: { method: "GET" } });
});

test("lists tool calls newest-first and maps approval and failure metadata", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = createSupabaseExecutionRepository({
    url: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    request: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify([{
        id: "tool-1", run_id: "run-2", agent_name: "shopify_ops_agent", tool_name: "shopify.product.update",
        capability: "execute", risk_level: 4, approval_id: "approval-1", outcome: "failed", error_code: "shopify_rate_limited",
        created_at: "2026-08-17T12:00:03.000Z",
      }]), { status: 200 });
    },
  });

  await expect(repository.listToolCalls()).resolves.toEqual([{
    id: "tool-1", runId: "run-2", agentName: "shopify_ops_agent", toolName: "shopify.product.update",
    capability: "execute", riskLevel: 4, approvalId: "approval-1", outcome: "failed", errorCode: "shopify_rate_limited",
    createdAt: "2026-08-17T12:00:03.000Z",
  }]);
  expect(requests[0]).toMatchObject({ url: "https://project.supabase.co/rest/v1/tool_calls?select=*&order=created_at.desc", init: { method: "GET" } });
});
