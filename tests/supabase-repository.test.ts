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


test("lists approval requests newest first", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = createSupabaseExecutionRepository({
    url: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    request: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(
        JSON.stringify([
          {
            id: "approval-2",
            agent_name: "creative_director_agent",
            action_type: "draft.campaign.copy",
            target_type: "campaign",
            target_id: "campaign-2",
            risk_level: 2,
            payload_summary: "Draft campaign copy.",
            status: "pending",
            created_at: "2026-08-16T12:00:00.000Z",
            updated_at: "2026-08-16T12:00:00.000Z",
          },
        ]),
        { status: 200 },
      );
    },
  });

  const approvals = await repository.listApprovals();

  expect(requests[0].url).toBe(
    "https://project.supabase.co/rest/v1/approval_requests?select=*&order=created_at.desc",
  );
  expect(approvals).toMatchObject([
    {
      id: "approval-2",
      requestingAgent: "creative_director_agent",
      actionType: "draft.campaign.copy",
      status: "pending",
    },
  ]);
});


test("updates a pending approval decision", async () => {
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
            target_id: "product-1",
            risk_level: 3,
            payload_summary: "Update product copy.",
            status: "approved",
            result: "Approved by founder.",
            created_at: "2026-08-15T12:00:00.000Z",
            updated_at: "2026-08-16T12:00:00.000Z",
            decided_at: "2026-08-16T12:00:00.000Z",
          },
        ]),
        { status: 200 },
      );
    },
  });

  const approval = await repository.decideApproval({
    approvalId: "approval-1",
    status: "approved",
    result: "Approved by founder.",
  });

  expect(requests[0].url).toBe(
    "https://project.supabase.co/rest/v1/approval_requests?id=eq.approval-1&status=eq.pending",
  );
  expect(requests[0].init?.method).toBe("PATCH");
  expect(JSON.parse(requests[0].init?.body as string)).toMatchObject({
    status: "approved",
    result: "Approved by founder.",
    decided_at: expect.any(String),
    updated_at: expect.any(String),
  });
  expect(approval).toMatchObject({ id: "approval-1", status: "approved" });
});


test("persists and looks up scheduled-run idempotency keys", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = createSupabaseExecutionRepository({
    url: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    request: async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).includes("idempotency_key=eq.daily-audit")) {
        return new Response(
          JSON.stringify([
            {
              id: "run-existing",
              agent_name: "shopify_ops_agent",
              provider: "system",
              model: "governed-tool-runner",
              route_agent: "shopify_ops_agent",
              risk_level: 1,
              status: "completed",
              idempotency_key: "daily-audit",
              created_at: "2026-08-17T12:00:00.000Z",
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify([
          {
            id: "run-new",
            agent_name: "shopify_ops_agent",
            provider: "system",
            model: "governed-tool-runner",
            route_agent: "shopify_ops_agent",
            risk_level: 1,
            status: "running",
            idempotency_key: "daily-audit",
            created_at: "2026-08-17T12:00:00.000Z",
          },
        ]),
        { status: 201 },
      );
    },
  });

  const created = await repository.createAgentRun({
    agentName: "shopify_ops_agent",
    provider: "system",
    model: "governed-tool-runner",
    routeAgent: "shopify_ops_agent",
    riskLevel: 1,
    inputSummary: "Daily audit.",
    idempotencyKey: "daily-audit",
  });
  const existing = await repository.findAgentRunByIdempotencyKey("daily-audit");

  expect(requests[0].url).toBe("https://project.supabase.co/rest/v1/agent_runs");
  expect(JSON.parse(requests[0].init?.body as string)).toMatchObject({ idempotency_key: "daily-audit" });
  expect(created.idempotencyKey).toBe("daily-audit");
  expect(requests[1].url).toBe(
    "https://project.supabase.co/rest/v1/agent_runs?idempotency_key=eq.daily-audit&limit=1",
  );
  expect(existing).toMatchObject({ id: "run-existing", idempotencyKey: "daily-audit" });
});


test("acquires and releases a distributed job lease through Supabase RPCs", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = createSupabaseExecutionRepository({
    url: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    request: async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/rpc/acquire_job_lease")) {
        return new Response(
          JSON.stringify([
            {
              lease_key: "daily-audit",
              owner_id: "worker-a",
              acquired_at: "2026-08-17T12:00:00.000Z",
              expires_at: "2026-08-17T12:01:00.000Z",
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([{ released: true }]), { status: 200 });
    },
  });

  const lease = await repository.acquireJobLease({
    leaseKey: "daily-audit",
    ownerId: "worker-a",
    leaseDurationMs: 60_000,
  });
  const released = await repository.releaseJobLease({ leaseKey: "daily-audit", ownerId: "worker-a" });

  expect(requests[0].url).toBe("https://project.supabase.co/rest/v1/rpc/acquire_job_lease");
  expect(JSON.parse(requests[0].init?.body as string)).toEqual({
    p_lease_key: "daily-audit",
    p_owner_id: "worker-a",
    p_lease_duration_ms: 60_000,
  });
  expect(lease).toMatchObject({ leaseKey: "daily-audit", ownerId: "worker-a" });
  expect(requests[1].url).toBe("https://project.supabase.co/rest/v1/rpc/release_job_lease");
  expect(released).toBe(true);
});
