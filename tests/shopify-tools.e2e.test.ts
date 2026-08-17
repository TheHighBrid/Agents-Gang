import { beforeEach, describe, expect, test, vi } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { createApprovalRequest } from "../tools/approvals";
import { runShopifyProductRead } from "../tools/shopify-products-tool";
import {
  runShopifyCollectionsRead,
  runShopifyProductByHandleRead,
} from "../tools/shopify-read-tools";
import {
  runShopifyProductCreate,
  runShopifyProductUpdate,
} from "../tools/shopify-write-tools";
import {
  runShopifyInventoryAdjust,
  runShopifyVariantCreate,
  runShopifyVariantUpdate,
} from "../tools/shopify-inventory-variant-tools";
import {
  runShopifyCustomerCreate,
  runShopifyCustomerRead,
  runShopifyCustomerUpdate,
} from "../tools/shopify-customer-tools";

const fetchMock = vi.hoisted(() => {
  process.env.SHOPIFY_STORE_MODE = "test";
  process.env.SHOPIFY_STORE_DOMAIN = "integration-test.myshopify.com";
  process.env.SHOPIFY_TEST_STORE_DOMAIN = "integration-test.myshopify.com";
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = "integration-test-token";
  return vi.fn();
});

vi.stubGlobal("fetch", fetchMock);

function mockShopifyResponse(data: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return {
    url,
    init,
    body: JSON.parse(String(init.body)) as { query: string; variables: Record<string, unknown> },
  };
}

async function approve(
  repository: ReturnType<typeof createInMemoryExecutionRepository>,
  actionType: string,
  target: { type: string; id: string },
) {
  const request = await createApprovalRequest(repository, {
    requestingAgent: "shopify_ops_agent",
    actionType,
    target,
    riskLevel: 3,
    payloadSummary: "End-to-end integration test approval.",
  });
  return repository.decideApproval({
    approvalId: request.id,
    status: "approved",
    result: "Approved for integration test.",
  });
}

describe("Shopify tools end-to-end integration", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  test("reads products through the real Shopify GraphQL transport", async () => {
    mockShopifyResponse({ products: { edges: [], pageInfo: { hasNextPage: false } } });
    const repository = createInMemoryExecutionRepository();

    const result = await runShopifyProductRead(
      { repository, runId: "e2e-products-read", agentName: "shopify_ops_agent" },
      { first: 2 },
    );

    expect(result).toEqual({ ok: true, data: { data: { products: { edges: [], pageInfo: { hasNextPage: false } } } } });
    const request = lastRequest();
    expect(request.url).toBe("https://integration-test.myshopify.com/admin/api/2026-04/graphql.json");
    expect(request.init.headers).toMatchObject({ "X-Shopify-Access-Token": "integration-test-token" });
    expect(request.body.query).toContain("query GetProducts");
    expect(request.body.variables).toEqual({ first: 2 });
  });

  test("reads a product by handle and collections through GraphQL", async () => {
    mockShopifyResponse({ productByHandle: { id: "product-1" } });
    const productRepository = createInMemoryExecutionRepository();
    const productResult = await runShopifyProductByHandleRead(
      { repository: productRepository, runId: "e2e-product-handle", agentName: "shopify_ops_agent" },
      { handle: "satin-track-pant" },
    );
    expect(productResult).toMatchObject({ ok: true, data: { data: { productByHandle: { id: "product-1" } } } });
    expect(lastRequest().body).toMatchObject({ variables: { handle: "satin-track-pant" } });
    expect(lastRequest().body.query).toContain("query GetProductByHandle");

    mockShopifyResponse({ collections: { edges: [] } });
    const collectionRepository = createInMemoryExecutionRepository();
    const collectionResult = await runShopifyCollectionsRead(
      { repository: collectionRepository, runId: "e2e-collections", agentName: "shopify_ops_agent" },
      { first: 3 },
    );
    expect(collectionResult).toMatchObject({ ok: true, data: { data: { collections: { edges: [] } } } });
    expect(lastRequest().body).toMatchObject({ variables: { first: 3 } });
    expect(lastRequest().body.query).toContain("query GetCollections");
  });

  test("creates and updates products only after approved execution", async () => {
    const createRepository = createInMemoryExecutionRepository();
    const createApproval = await approve(createRepository, "shopify.product.create", {
      type: "shopify_product",
      id: "new",
    });
    mockShopifyResponse({ productCreate: { product: { id: "product-1" }, userErrors: [] } });
    const createResult = await runShopifyProductCreate(
      {
        repository: createRepository,
        runId: "e2e-product-create",
        agentName: "shopify_ops_agent",
        approvalId: createApproval.id,
      },
      { title: "Integration Product", status: "DRAFT" },
    );
    expect(createResult).toMatchObject({ ok: true, data: { data: { productCreate: { product: { id: "product-1" } } } } });
    expect(lastRequest().body.query).toContain("mutation CreateProduct");
    expect(lastRequest().body.variables).toEqual({ input: { title: "Integration Product", status: "DRAFT" } });

    const productId = "gid://shopify/Product/1";
    const updateRepository = createInMemoryExecutionRepository();
    const updateApproval = await approve(updateRepository, "shopify.product.update", {
      type: "shopify_product",
      id: productId,
    });
    mockShopifyResponse({ productUpdate: { product: { id: productId }, userErrors: [] } });
    const updateResult = await runShopifyProductUpdate(
      {
        repository: updateRepository,
        runId: "e2e-product-update",
        agentName: "shopify_ops_agent",
        approvalId: updateApproval.id,
      },
      { productId, title: "Updated Integration Product" },
    );
    expect(updateResult).toMatchObject({ ok: true, data: { data: { productUpdate: { product: { id: productId } } } } });
    expect(lastRequest().body.query).toContain("mutation UpdateProduct");
    expect(lastRequest().body.variables).toEqual({ input: { id: productId, title: "Updated Integration Product" } });
  });

  test("adjusts inventory and manages variants through approved mutations", async () => {
    const inventoryItemId = "gid://shopify/InventoryItem/1";
    const locationId = "gid://shopify/Location/1";
    const inventoryRepository = createInMemoryExecutionRepository();
    const inventoryApproval = await approve(inventoryRepository, "shopify.inventory.adjust", {
      type: "shopify_inventory_level",
      id: `${inventoryItemId}:${locationId}`,
    });
    mockShopifyResponse({ inventoryAdjustQuantities: { userErrors: [], inventoryAdjustmentGroup: {} } });
    const inventoryResult = await runShopifyInventoryAdjust(
      {
        repository: inventoryRepository,
        runId: "e2e-inventory-adjust",
        agentName: "shopify_ops_agent",
        approvalId: inventoryApproval.id,
      },
      { inventoryItemId, locationId, delta: 4, reason: "correction", idempotencyKey: "e2e-key" },
    );
    expect(inventoryResult).toMatchObject({ ok: true, data: { data: { inventoryAdjustQuantities: { userErrors: [] } } } });
    expect(lastRequest().body.query).toContain("mutation AdjustInventory");
    expect(lastRequest().body.variables).toMatchObject({
      idempotencyKey: "e2e-key",
      input: { name: "available", changes: [{ inventoryItemId, locationId, delta: 4 }] },
    });

    const productId = "gid://shopify/Product/1";
    const createRepository = createInMemoryExecutionRepository();
    const createApproval = await approve(createRepository, "shopify.variant.create", {
      type: "shopify_product",
      id: productId,
    });
    mockShopifyResponse({ productVariantsBulkCreate: { productVariants: [{ id: "variant-1" }], userErrors: [] } });
    const createResult = await runShopifyVariantCreate(
      {
        repository: createRepository,
        runId: "e2e-variant-create",
        agentName: "shopify_ops_agent",
        approvalId: createApproval.id,
      },
      { productId, variants: [{ price: "99.00" }] },
    );
    expect(createResult).toMatchObject({ ok: true, data: { data: { productVariantsBulkCreate: { userErrors: [] } } } });
    expect(lastRequest().body.query).toContain("mutation CreateProductVariants");

    const updateRepository = createInMemoryExecutionRepository();
    const updateApproval = await approve(updateRepository, "shopify.variant.update", {
      type: "shopify_product",
      id: productId,
    });
    mockShopifyResponse({ productVariantsBulkUpdate: { productVariants: [{ id: "variant-1" }], userErrors: [] } });
    const updateResult = await runShopifyVariantUpdate(
      {
        repository: updateRepository,
        runId: "e2e-variant-update",
        agentName: "shopify_ops_agent",
        approvalId: updateApproval.id,
      },
      { productId, variants: [{ id: "variant-1", price: "109.00" }] },
    );
    expect(updateResult).toMatchObject({ ok: true, data: { data: { productVariantsBulkUpdate: { userErrors: [] } } } });
    expect(lastRequest().body.query).toContain("mutation UpdateProductVariants");
  });

  test("reads, creates, and updates customers through the GraphQL boundary", async () => {
    mockShopifyResponse({ customers: { nodes: [], pageInfo: { hasNextPage: false } } });
    const readRepository = createInMemoryExecutionRepository();
    const readResult = await runShopifyCustomerRead(
      { repository: readRepository, runId: "e2e-customers-read", agentName: "shopify_ops_agent" },
      { first: 5, query: 'email:"customer@example.com"' },
    );
    expect(readResult).toMatchObject({ ok: true, data: { data: { customers: { nodes: [] } } } });
    expect(lastRequest().body.query).toContain("query GetCustomers");
    expect(lastRequest().body.variables).toEqual({ first: 5, query: 'email:"customer@example.com"' });

    const createRepository = createInMemoryExecutionRepository();
    const createApproval = await approve(createRepository, "shopify.customer.create", {
      type: "shopify_customer",
      id: "new",
    });
    mockShopifyResponse({ customerCreate: { customer: { id: "customer-1" }, userErrors: [] } });
    const createResult = await runShopifyCustomerCreate(
      {
        repository: createRepository,
        runId: "e2e-customer-create",
        agentName: "shopify_ops_agent",
        approvalId: createApproval.id,
      },
      { email: "customer@example.com", firstName: "Integration" },
    );
    expect(createResult).toMatchObject({ ok: true, data: { data: { customerCreate: { customer: { id: "customer-1" } } } } });
    expect(lastRequest().body.query).toContain("mutation CreateCustomer");

    const customerId = "gid://shopify/Customer/1";
    const updateRepository = createInMemoryExecutionRepository();
    const updateApproval = await approve(updateRepository, "shopify.customer.update", {
      type: "shopify_customer",
      id: customerId,
    });
    mockShopifyResponse({ customerUpdate: { customer: { id: customerId }, userErrors: [] } });
    const updateResult = await runShopifyCustomerUpdate(
      {
        repository: updateRepository,
        runId: "e2e-customer-update",
        agentName: "shopify_ops_agent",
        approvalId: updateApproval.id,
      },
      { customerId, tags: ["vip"] },
    );
    expect(updateResult).toMatchObject({ ok: true, data: { data: { customerUpdate: { customer: { id: customerId } } } } });
    expect(lastRequest().body.query).toContain("mutation UpdateCustomer");
  });

  test("preserves normalized Shopify rate-limit classification in audit records", async () => {
    fetchMock.mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "Retry-After": "2" } }));
    const repository = createInMemoryExecutionRepository();

    const result = await runShopifyProductRead(
      { repository, runId: "e2e-rate-limited", agentName: "shopify_ops_agent" },
      { first: 2 },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "tool_execution_failed", retriable: true } });
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      { toolName: "shopify.products.read", outcome: "failed", errorCode: "shopify_rate_limited" },
    ]);
    await expect(repository.listAuditEvents()).resolves.toMatchObject([
      { toolName: "shopify.products.read", outcome: "failed", metadata: { errorCode: "shopify_rate_limited" } },
    ]);
  });

  test("preserves normalized Shopify timeout classification in audit records", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const repository = createInMemoryExecutionRepository();

    const result = await runShopifyProductRead(
      { repository, runId: "e2e-timeout", agentName: "shopify_ops_agent" },
      { first: 2 },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "tool_execution_failed", retriable: true } });
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      { toolName: "shopify.products.read", outcome: "failed", errorCode: "shopify_timeout" },
    ]);
    await expect(repository.listAuditEvents()).resolves.toMatchObject([
      { toolName: "shopify.products.read", outcome: "failed", metadata: { errorCode: "shopify_timeout" } },
    ]);
  });

  test("blocks a high-risk Shopify mutation before making a network request", async () => {
    const repository = createInMemoryExecutionRepository();
    const result = await runShopifyProductUpdate(
      { repository, runId: "e2e-blocked", agentName: "shopify_ops_agent" },
      { productId: "gid://shopify/Product/1", title: "Should not send" },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "approval_required" } });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(repository.listAuditEvents()).resolves.toMatchObject([
      {
        toolName: "shopify.product.update",
        outcome: "blocked",
        metadata: { errorCode: "approval_required" },
      },
    ]);
  });
});
