import { describe, expect, test } from "vitest";

import { summarizeOperationalHealth } from "../lib/observability/operational-health";

describe("operational health", () => {
  test("summarizes safe execution metrics without returning record payloads", () => {
    const health = summarizeOperationalHealth({
      runs: [
        { id: "run-1", status: "completed" },
        { id: "run-2", status: "failed", errorCode: "scheduled_job_retryable" },
        { id: "run-3", status: "running" },
      ],
      auditEvents: [
        { id: "event-1", outcome: "blocked", metadata: { apiKey: "secret" } },
      ],
      toolCalls: [
        { id: "tool-1", outcome: "failed", errorCode: "provider_timeout" },
      ],
    });

    expect(health.metrics).toEqual({
      totalRuns: 3,
      completedRuns: 1,
      failedRuns: 1,
      runningRuns: 1,
      retryableFailedRuns: 1,
      providerTimeouts: 1,
      persistenceTimeouts: 0,
      blockedEvents: 1,
    });
    expect(JSON.stringify(health)).not.toContain("secret");
  });

  test("raises actionable alerts for failed jobs, timeouts, and repeated blocks", () => {
    const health = summarizeOperationalHealth({
      runs: Array.from({ length: 5 }, (_, index) => ({ id: `run-${index}`, status: "failed" })),
      auditEvents: Array.from({ length: 10 }, (_, index) => ({ id: `event-${index}`, outcome: "blocked", metadata: {} })),
      toolCalls: [
        { id: "tool-1", outcome: "failed", errorCode: "provider_timeout" },
        { id: "tool-2", outcome: "failed", errorCode: "provider_timeout" },
        { id: "tool-3", outcome: "failed", errorCode: "provider_timeout" },
        { id: "tool-4", outcome: "failed", errorCode: "execution_persistence_timeout" },
        { id: "tool-5", outcome: "failed", errorCode: "execution_persistence_timeout" },
      ],
    });

    expect(health.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "failed_jobs", severity: "critical", count: 5, owner: "operations" }),
        expect.objectContaining({ key: "provider_timeouts", severity: "warning", count: 3, owner: "integrations" }),
        expect.objectContaining({ key: "persistence_timeouts", severity: "warning", count: 2, owner: "platform" }),
        expect.objectContaining({ key: "repeated_blocks", severity: "critical", count: 10, owner: "governance" }),
      ]),
    );
  });
});
