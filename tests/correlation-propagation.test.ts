import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { resolveCorrelationId } from "../lib/observability/correlation";
import { runReliableScheduledJob } from "../jobs/reliableScheduler";
import { runShopifyProductRead } from "../tools/shopify-products-tool";

describe("operational correlation", () => {
  test("accepts only bounded safe request correlation identifiers", () => {
    const supplied = new Request("https://example.test/api/chat", {
      headers: { "x-correlation-id": "corr.chat_2026-08-18:001" },
    });
    expect(resolveCorrelationId(supplied)).toBe("corr.chat_2026-08-18:001");

    const unsafe = new Request("https://example.test/api/chat", {
      headers: { "x-correlation-id": "contains spaces and payload text" },
    });
    expect(resolveCorrelationId(unsafe)).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("traces one scheduled tool run from scheduler claim through durable run/tool/audit records", async () => {
    const repository = createInMemoryExecutionRepository({
      idFactory: (() => { let n = 0; return () => `id-${++n}`; })(),
    });
    const correlationId = "corr.scheduler:product-page-scan:001";

    const result = await runReliableScheduledJob({
      repository,
      correlationId,
      jobName: "job.product_page_scan",
      idempotencyKey: "product-page-scan:2026-08-18T06:00Z",
      agentName: "product_page_agent",
      inputSummary: "Scheduled product-page scan",
      reason: "Verify product metadata",
      neededTools: ["shopify.products.read"],
      retry: { retryDelayMs: 0, delay: async () => undefined },
      execute: (context) => runShopifyProductRead(context, { first: 1 }, async () => ({ products: [] })),
    });

    expect(result.outcome).toBe("completed");
    const [run] = await repository.listAgentRuns();
    const [decision] = await repository.listRoutingDecisions();
    const [toolCall] = await repository.listToolCalls();
    const auditEvents = await repository.listAuditEvents();

    expect(decision.runId).toBe(run.id);
    expect(toolCall.runId).toBe(run.id);
    expect(auditEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        runId: run.id,
        eventType: "run.correlation",
        metadata: expect.objectContaining({ correlationId }),
      }),
      expect.objectContaining({
        eventType: "scheduled_job.claimed",
        metadata: expect.objectContaining({ correlationId, jobName: "job.product_page_scan" }),
      }),
      expect.objectContaining({
        runId: run.id,
        eventType: "tool.execution",
        metadata: expect.objectContaining({ correlationId }),
      }),
      expect.objectContaining({
        runId: run.id,
        eventType: "scheduled_job.completed",
        metadata: expect.objectContaining({ correlationId, jobName: "job.product_page_scan" }),
      }),
    ]));
  });
});
