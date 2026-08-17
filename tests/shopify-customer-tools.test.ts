import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { createApprovalRequest } from "../tools/approvals";
import {
  runShopifyCustomerCreate,
  runShopifyCustomerRead,
  runShopifyCustomerUpdate,
} from "../tools/shopify-customer-tools";

async function approve(
  repository: ReturnType<typeof createInMemoryExecutionRepository>,
  actionType: string,
  customerId = "new",
) {
  const request = await createApprovalRequest(repository, {
    requestingAgent: "shopify_ops_agent",
    actionType,
    target: { type: "shopify_customer", id: customerId },
    riskLevel: 3,
    payloadSummary: "Approved Shopify customer write.",
  });
  return repository.decideApproval({
    approvalId: request.id,
    status: "approved",
    result: "Approved.",
  });
}

describe("Shopify customer tools", () => {
  test("reads a bounded customer list through the governed read contract", async () => {
    const repository = createInMemoryExecutionRepository();

    const result = await runShopifyCustomerRead(
      {
        repository,
        runId: "run-customers-read",
        agentName: "shopify_ops_agent",
      },
      { first: 10, query: 'email:"customer@example.com"' },
      async (input) => ({ customers: [], ...input }),
    );

    expect(result).toEqual({
      ok: true,
      data: { customers: [], first: 10, query: 'email:"customer@example.com"' },
    });
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      {
        toolName: "shopify.customers.read",
        capability: "read",
        riskLevel: 1,
        outcome: "succeeded",
      },
    ]);
  });

  test("blocks customer creation without approval", async () => {
    const repository = createInMemoryExecutionRepository();
    let calls = 0;

    const result = await runShopifyCustomerCreate(
      {
        repository,
        runId: "run-customer-create-blocked",
        agentName: "shopify_ops_agent",
      },
      { email: "new@example.com", firstName: "New" },
      async () => {
        calls += 1;
        return { created: true };
      },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "approval_required" } });
    expect(calls).toBe(0);
  });

  test("creates a customer after matching approval", async () => {
    const repository = createInMemoryExecutionRepository();
    const approval = await approve(repository, "shopify.customer.create");

    const result = await runShopifyCustomerCreate(
      {
        repository,
        runId: "run-customer-create",
        agentName: "shopify_ops_agent",
        approvalId: approval.id,
      },
      { email: "new@example.com", firstName: "New", tags: ["prospect"] },
      async (input) => ({ created: input }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        created: { email: "new@example.com", firstName: "New", tags: ["prospect"] },
      },
    });
  });

  test("updates a customer only for the exact approved customer target", async () => {
    const repository = createInMemoryExecutionRepository();
    const customerId = "gid://shopify/Customer/1";
    const approval = await approve(repository, "shopify.customer.update", customerId);

    const result = await runShopifyCustomerUpdate(
      {
        repository,
        runId: "run-customer-update",
        agentName: "shopify_ops_agent",
        approvalId: approval.id,
      },
      { customerId, firstName: "Updated", taxExempt: true },
      async (input) => ({ updated: input }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        updated: { customerId, firstName: "Updated", taxExempt: true },
      },
    });
  });

  test("rejects creating a customer without an identifying field", async () => {
    const repository = createInMemoryExecutionRepository();
    const approval = await approve(repository, "shopify.customer.create");

    const result = await runShopifyCustomerCreate(
      {
        repository,
        runId: "run-customer-invalid",
        agentName: "shopify_ops_agent",
        approvalId: approval.id,
      },
      { tags: ["prospect"] },
      async () => ({ created: true }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });
});
