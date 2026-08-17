import { describe, expect, test, vi } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runShopifyProductRead } from "../tools/shopify-products-tool";

const fetchMock = vi.hoisted(() => {
  process.env.SHOPIFY_STORE_MODE = "test";
  process.env.SHOPIFY_STORE_DOMAIN = "integration-test.myshopify.com";
  process.env.SHOPIFY_TEST_STORE_DOMAIN = "integration-test.myshopify.com";
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = "integration-test-token";
  return vi.fn();
});

vi.stubGlobal("fetch", fetchMock);

describe("Shopify governed failure contract", () => {
  test("records a normalized rate-limit code and retryability in governed audit records", async () => {
    fetchMock.mockResolvedValueOnce(new Response("slow down", { status: 429 }));
    const repository = createInMemoryExecutionRepository();

    const result = await runShopifyProductRead(
      { repository, runId: "shopify-rate-limited", agentName: "shopify_ops_agent" },
      { first: 1 },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "tool_execution_failed",
        message: "Shopify request was rate limited",
        retriable: true,
      },
    });
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      { toolName: "shopify.products.read", outcome: "failed", errorCode: "shopify_rate_limited" },
    ]);
    await expect(repository.listAuditEvents()).resolves.toMatchObject([
      { toolName: "shopify.products.read", outcome: "failed", metadata: { errorCode: "shopify_rate_limited" } },
    ]);
  });
});
