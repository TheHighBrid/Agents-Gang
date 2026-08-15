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
