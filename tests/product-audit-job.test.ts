import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runProductAuditJob } from "../jobs/productAudit";

describe("product audit scheduled job", () => {
  test("reads products and audits their image sources through governed tools", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: () => "audit-run-1" });
    const result = await runProductAuditJob(
      repository,
      async () => ({
        data: {
          products: {
            edges: [{ node: { id: "product-1", title: "Sample", images: { edges: [{ node: { url: "https://cdn.test/sample.jpg" } }] } } }],
          },
        },
      }),
      async (url) => ({ url, reachable: true, contentType: "image/jpeg", contentLengthBytes: 100, etag: null, isImage: true }),
    );

    expect(result.data.products).toHaveLength(1);
    expect(result.data.products[0]).toMatchObject({ id: "product-1", imageAudits: [{ ok: true, data: { isImage: true } }] });
    await expect(repository.listToolCalls()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ runId: "audit-run-1", toolName: "shopify.products.read", outcome: "succeeded" }),
      expect.objectContaining({ runId: "audit-run-1", toolName: "product.image.audit", outcome: "succeeded" }),
    ]));
  });

  test("keeps per-image failures in the audit result without losing the scheduled run", async () => {
    const repository = createInMemoryExecutionRepository({ idFactory: () => "audit-run-2" });
    const result = await runProductAuditJob(
      repository,
      async () => ({ data: { products: [{ id: "product-2", title: "Sample", images: [{ url: "https://cdn.test/missing.jpg" }] }] } }),
      async () => { throw new Error("image unavailable"); },
    );

    expect(result.data.products[0].imageAudits[0]).toMatchObject({ ok: false, error: { code: "tool_execution_failed" } });
    await expect(repository.listAgentRuns()).resolves.toMatchObject([{ id: "audit-run-2", status: "completed" }]);
  });
});
