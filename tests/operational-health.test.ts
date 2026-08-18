import { describe, expect, test } from "vitest";
import { evaluateOperationalHealth } from "../lib/observability/operational-health";

describe("operational health policy", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");

  test("raises deterministic payload-safe alerts at the documented thresholds", () => {
    const health = evaluateOperationalHealth({
      now,
      scheduledJobs: [
        { status: "failed", updatedAt: "2026-08-18T11:59:00.000Z" },
      ],
      agentRuns: [],
      toolCalls: [
        { outcome: "failed", errorCode: "shopify_timeout", createdAt: "2026-08-18T11:58:00.000Z" },
        { outcome: "failed", errorCode: "gmail_timeout", createdAt: "2026-08-18T11:57:00.000Z" },
        { outcome: "failed", errorCode: "shopify_timeout", createdAt: "2026-08-18T11:56:00.000Z" },
        { outcome: "blocked", createdAt: "2026-08-18T11:55:00.000Z" },
        { outcome: "blocked", createdAt: "2026-08-18T11:54:00.000Z" },
        { outcome: "blocked", createdAt: "2026-08-18T11:53:00.000Z" },
      ],
      auditEvents: [
        {
          outcome: "failed",
          metadata: { errorCode: "execution_persistence_timeout", payload: "must-not-escape" },
          createdAt: "2026-08-18T11:52:00.000Z",
        },
      ],
    });

    expect(health.windowMinutes).toBe(15);
    expect(health.metrics).toEqual({
      failedJobs: 1,
      providerTimeouts: 3,
      persistenceTimeouts: 1,
      blockedActions: 3,
    });
    expect(health.alerts.map((alert) => alert.code)).toEqual([
      "failed_jobs",
      "provider_timeouts",
      "persistence_timeouts",
      "repeated_blocks",
    ]);
    expect(JSON.stringify(health)).not.toContain("must-not-escape");
    expect(health.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "failed_jobs", owner: "manus", threshold: 1 }),
      expect.objectContaining({ code: "provider_timeouts", owner: "manus", threshold: 3 }),
      expect.objectContaining({ code: "persistence_timeouts", owner: "manus", threshold: 1 }),
      expect.objectContaining({ code: "repeated_blocks", owner: "sol-5.6", threshold: 3 }),
    ]));
  });

  test("ignores stale events and remains quiet below thresholds", () => {
    const health = evaluateOperationalHealth({
      now,
      scheduledJobs: [
        { status: "failed", updatedAt: "2026-08-18T11:30:00.000Z" },
      ],
      agentRuns: [],
      toolCalls: [
        { outcome: "failed", errorCode: "shopify_timeout", createdAt: "2026-08-18T11:59:00.000Z" },
        { outcome: "blocked", createdAt: "2026-08-18T11:58:00.000Z" },
      ],
      auditEvents: [],
    });

    expect(health.metrics).toEqual({
      failedJobs: 0,
      providerTimeouts: 1,
      persistenceTimeouts: 0,
      blockedActions: 1,
    });
    expect(health.alerts).toEqual([]);
  });
});
