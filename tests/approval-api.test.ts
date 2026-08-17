import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { getApprovalListResponse } from "../lib/approvals/approval-api";

describe("approval list response", () => {
  test("returns persisted approval requests in repository order", async () => {
    let now = new Date("2026-08-17T10:00:00.000Z");
    const repository = createInMemoryExecutionRepository({
      clock: () => now,
      idFactory: (() => {
        let index = 0;
        return () => `approval-${++index}`;
      })(),
    });
    await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "shopify_product", id: "old" },
      riskLevel: 3,
      payloadSummary: "Update old product",
    });
    now = new Date("2026-08-17T10:05:00.000Z");
    await repository.createApproval({
      requestingAgent: "shopify_ops_agent",
      actionType: "shopify.product.update",
      target: { type: "shopify_product", id: "new" },
      riskLevel: 4,
      payloadSummary: "Update new product",
    });

    const response = await getApprovalListResponse(repository);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      approvals: [
        { id: "approval-2", status: "pending", riskLevel: 4 },
        { id: "approval-1", status: "pending", riskLevel: 3 },
      ],
    });
  });
});

test("returns a bounded safe page and opaque continuation cursor", async () => {
  const repository = createInMemoryExecutionRepository({
    clock: () => new Date("2026-08-17T10:00:00.000Z"),
    idFactory: (() => { let id = 0; return () => `approval-${++id}`; })(),
  });
  await repository.createApproval({
    requestingAgent: "agent",
    actionType: "publish",
    target: { type: "product", id: "one" },
    riskLevel: 3,
    payloadSummary: "private payload one",
  });
  await repository.createApproval({
    requestingAgent: "agent",
    actionType: "publish",
    target: { type: "product", id: "two" },
    riskLevel: 3,
    payloadSummary: "private payload two",
  });

  const response = await getApprovalListResponse(repository, "https://example.test/api/approvals?limit=1");
  const body = await response.json() as { approvals: Array<Record<string, unknown>>; nextCursor: string | null };

  expect(response.status).toBe(200);
  expect(body.approvals).toHaveLength(1);
  expect(body.approvals[0]).not.toHaveProperty("payloadSummary");
  expect(body.approvals[0]).toHaveProperty("summary");
  expect(body.nextCursor).toEqual(expect.any(String));
});

test("returns a safe client error for invalid pagination instead of throwing", async () => {
  const repository = createInMemoryExecutionRepository();

  const response = await getApprovalListResponse(repository, "https://example.test/api/approvals?limit=0");

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Limit must be an integer from 1 to 100" });
});
