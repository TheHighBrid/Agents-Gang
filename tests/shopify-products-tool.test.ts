import { describe, expect, test } from "vitest";

import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runShopifyProductRead } from "../tools/shopify-products-tool";

describe("Shopify product read tool", () => {
  test("runs a product read through the common contract and records a successful read", async () => {
    const repository = createInMemoryExecutionRepository({
      clock: () => new Date("2026-08-15T12:00:00.000Z"),
      idFactory: () => "tool-call-1",
    });

    const result = await runShopifyProductRead(
      {
        repository,
        runId: "run-1",
        agentName: "shopify_ops_agent",
      },
      { first: 2 },
      async (first) => ({ products: [{ id: "product-1" }], first }),
    );

    expect(result).toEqual({
      ok: true,
      data: { products: [{ id: "product-1" }], first: 2 },
    });
    expect(await repository.listToolCalls()).toMatchObject([
      {
        toolName: "shopify.products.read",
        capability: "read",
        riskLevel: 1,
        outcome: "succeeded",
      },
    ]);
    expect(await repository.listAuditEvents()).toMatchObject([
      {
        runId: "run-1",
        toolName: "shopify.products.read",
        eventType: "tool.execution",
        outcome: "succeeded",
        metadata: {},
      },
    ]);
  });
});


test("normalizes Shopify rate limits as retryable errors", async () => {
  const { createShopifyClient } = await import("../tools/shopify");
  const client = createShopifyClient({
    storeDomain: "example.myshopify.com",
    accessToken: "test-token",
    request: async () => new Response("", { status: 429, headers: { "Retry-After": "7" } }),
  });

  await expect(client.getProducts(20)).rejects.toMatchObject({
    code: "rate_limited",
    retryable: true,
    retryAfterSeconds: 7,
  });
});

test("normalizes Shopify auth failures without exposing credentials", async () => {
  const { createShopifyClient } = await import("../tools/shopify");
  const client = createShopifyClient({
    storeDomain: "example.myshopify.com",
    accessToken: "super-secret-token",
    request: async () => new Response("forbidden", { status: 401 }),
  });

  await expect(client.getProducts(20)).rejects.toMatchObject({
    code: "authentication_failed",
    retryable: false,
  });
  await expect(client.getProducts(20)).rejects.not.toThrow("super-secret-token");
});

test("rejects malformed and GraphQL-error responses through the transport boundary", async () => {
  const { createShopifyClient } = await import("../tools/shopify");
  const malformed = createShopifyClient({
    storeDomain: "example.myshopify.com",
    accessToken: "test-token",
    request: async () => new Response("not-json", { status: 200 }),
  });
  await expect(malformed.getProducts(20)).rejects.toMatchObject({ code: "malformed_response" });

  const graphqlError = createShopifyClient({
    storeDomain: "example.myshopify.com",
    accessToken: "test-token",
    request: async () => new Response(JSON.stringify({ errors: [{ message: "Query rejected" }] }), { status: 200 }),
  });
  await expect(graphqlError.getProducts(20)).rejects.toMatchObject({ code: "graphql_error", retryable: false });
});
