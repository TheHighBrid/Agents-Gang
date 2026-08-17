import { describe, expect, test } from "vitest";
import { createInMemoryExecutionRepository } from "../lib/execution/repository";
import { runWebSearch } from "../tools/web-search-tool";

describe("governed web search tool", () => {
  test("executes as a risk-one read and records successful governance events", async () => {
    const repository = createInMemoryExecutionRepository({
      idFactory: (() => {
        let index = 0;
        return () => `record-${++index}`;
      })(),
      clock: () => new Date("2026-08-17T12:00:00.000Z"),
    });

    const result = await runWebSearch(
      {
        runId: "run-1",
        agentName: "trend_radar_agent",
        repository,
      },
      { query: "Ottawa fashion events", limit: 3 },
      async (query, limit) => [{ title: query, url: "https://example.test", snippet: String(limit) }],
    );

    expect(result).toEqual({
      ok: true,
      data: [{ title: "Ottawa fashion events", url: "https://example.test", snippet: "3" }],
    });
    await expect(repository.listToolCalls()).resolves.toMatchObject([
      { toolName: "web.search", capability: "read", riskLevel: 1, outcome: "succeeded" },
    ]);
    await expect(repository.listAuditEvents()).resolves.toMatchObject([
      { toolName: "web.search", eventType: "tool.execution", outcome: "succeeded" },
    ]);
  });
});
