import { describe, expect, test, vi } from "vitest";
import { createShopifyGraphQLAdapter } from "../tools/shopify";

const testStoreEnvironment = {
  SHOPIFY_STORE_MODE: "test",
  SHOPIFY_STORE_DOMAIN: "agents-gang-test.myshopify.com",
  SHOPIFY_TEST_STORE_DOMAIN: "agents-gang-test.myshopify.com",
  SHOPIFY_ADMIN_ACCESS_TOKEN: "test-store-secret",
};

describe("Shopify production adapter boundary", () => {
  test("permits only the explicitly configured test store in test mode", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { shop: { name: "Test Store" } } }), { status: 200 }));
    const adapter = createShopifyGraphQLAdapter(testStoreEnvironment, fetcher);

    await expect(adapter.graphql("query { shop { name } }")).resolves.toEqual({ data: { shop: { name: "Test Store" } } });
    expect(fetcher).toHaveBeenCalledWith(
      "https://agents-gang-test.myshopify.com/admin/api/2026-04/graphql.json",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("fails closed when test mode points at a non-allowlisted store", () => {
    expect(() => createShopifyGraphQLAdapter({
      ...testStoreEnvironment,
      SHOPIFY_STORE_DOMAIN: "live-store.myshopify.com",
    })).toThrow("Shopify test store domain does not match the configured store");
  });

  test("applies a bounded request timeout and normalizes aborts", async () => {
    const fetcher = vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const adapter = createShopifyGraphQLAdapter({ ...testStoreEnvironment, SHOPIFY_REQUEST_TIMEOUT_MS: "2500" }, fetcher);

    await expect(adapter.graphql("query { shop { name } }")).rejects.toMatchObject({
      code: "shopify_timeout",
      retriable: true,
    });
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  test("normalizes rate-limit responses without exposing credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("slow down", { status: 429, headers: { "Retry-After": "3" } }));
    const adapter = createShopifyGraphQLAdapter(testStoreEnvironment, fetcher);

    await expect(adapter.graphql("query { shop { name } }")).rejects.toMatchObject({
      code: "shopify_rate_limited",
      status: 429,
      retriable: true,
      retryAfterSeconds: 3,
    });
    await expect(adapter.graphql("query { shop { name } }")).rejects.not.toThrow("test-store-secret");
  });

  test("normalizes authentication, GraphQL, and malformed-response failures", async () => {
    const unauthorized = createShopifyGraphQLAdapter(
      testStoreEnvironment,
      vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })),
    );
    await expect(unauthorized.graphql("query { shop { name } }")).rejects.toMatchObject({
      code: "shopify_auth_failed",
      status: 401,
      retriable: false,
    });

    const graphqlFailure = createShopifyGraphQLAdapter(
      testStoreEnvironment,
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: "Invalid query" }] }), { status: 200 })),
    );
    await expect(graphqlFailure.graphql("query { shop { name } }")).rejects.toMatchObject({
      code: "shopify_graphql_failed",
      status: 200,
      retriable: false,
    });

    const userError = createShopifyGraphQLAdapter(
      testStoreEnvironment,
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { productUpdate: { userErrors: [{ message: "Invalid title" }] } } }), { status: 200 })),
    );
    await expect(userError.graphql("mutation { productUpdate { userErrors { message } } }")).rejects.toMatchObject({
      code: "shopify_user_error",
      status: 200,
      retriable: false,
    });

    const malformed = createShopifyGraphQLAdapter(
      testStoreEnvironment,
      vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })),
    );
    await expect(malformed.graphql("query { shop { name } }")).rejects.toMatchObject({
      code: "shopify_malformed_response",
      status: 200,
      retriable: true,
    });
  });
});
