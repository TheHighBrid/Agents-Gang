import { describe, expect, test } from "vitest";
import { runDailyMelatoAuditJob } from "../jobs/dailyMelatoAudit";
import { TREND_RADAR_QUERIES, runWeeklyTrendRadarJob } from "../jobs/weeklyTrendRadar";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";

describe("remaining governed scheduled audits", () => {
  test("routes the daily audit through governed Shopify and image tools", async () => {
    const repository = createInMemoryExecutionRepository();
    const result = await runDailyMelatoAuditJob(
      repository,
      async () => ({
        data: { products: { nodes: [{ id: "product-1", title: "OVUM", images: { nodes: [{ url: "https://example.test/ovum.jpg" }] } }] } },
      }),
      async (url) => ({
        url,
        reachable: true,
        contentType: "image/jpeg",
        contentLengthBytes: 2048,
        etag: null,
        isImage: true,
      }),
    );

    expect(result.data.products).toHaveLength(1);
    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      { agentName: "shopify_ops_agent", status: "completed" },
    ]);
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      { toolName: "shopify.products.read", outcome: "succeeded" },
      { toolName: "product.image.audit", outcome: "succeeded" },
    ]);
  });

  test("records every weekly radar search under one scheduled run", async () => {
    const repository = createInMemoryExecutionRepository();
    const result = await runWeeklyTrendRadarJob(repository, async (query, limit) => [
      { title: query, url: `https://example.test/${limit}`, snippet: "Source summary" },
    ]);

    expect(result.data.topics.map((topic) => topic.query)).toEqual([...TREND_RADAR_QUERIES]);
    expect(await repository.listToolCalls()).toHaveLength(TREND_RADAR_QUERIES.length);
    await expect(repository.listRoutingDecisions()).resolves.toMatchObject([
      { selectedAgent: "trend_radar_agent", neededTools: ["web.search"], approvalRequired: false },
    ]);
  });

  test("fails the weekly run when a governed search fails", async () => {
    const repository = createInMemoryExecutionRepository();
    await expect(runWeeklyTrendRadarJob(repository, async () => {
      throw new Error("search unavailable");
    })).rejects.toThrow("search unavailable");
    await expect(repository.listAgentRuns()).resolves.toMatchObject([
      { agentName: "trend_radar_agent", status: "failed", errorCode: "scheduled_job_failed" },
    ]);
  });
});
