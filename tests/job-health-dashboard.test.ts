import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("founder job health dashboard", () => {
  test("renders durable scheduler health and alert fields from the persisted snapshot", () => {
    const page = read("app/dashboard/page.tsx");

    for (const contract of [
      "scheduledJobs",
      "operationalHealth",
      "Job health",
      "Operational alerts",
      "attemptCount",
      "maxAttempts",
      "retryable",
      "lastErrorCode",
      "nextRetryAt",
      "correlationId",
      "recommendedAction",
      "threshold",
      "nextAction",
    ]) {
      expect(page).toContain(contract);
    }
  });

  test("handles empty or partial telemetry without exposing internals", () => {
    const page = read("app/dashboard/page.tsx");

    expect(page).toContain("No scheduled job history is available yet.");
    expect(page).toContain("Operational alert telemetry is unavailable.");
    expect(page).toContain("Correlation:");
    expect(page).toContain("Next action:");
    expect(page).not.toContain("payloadSummary");
    expect(page).not.toContain("audit.metadata");
  });

  test("keeps job-health state accessible without relying on authentication UI", () => {
    const page = read("app/dashboard/page.tsx");

    expect(page).toContain("aria-labelledby=\"job-health-heading\"");
    expect(page).toContain("aria-labelledby=\"operational-alerts-heading\"");
    expect(page).toContain("role=\"status\"");
    expect(page).toContain("status-badge");
    expect(page).toContain("Authentication disabled");
    expect(page).not.toContain("Founder access secret");
  });
});
