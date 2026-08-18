import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("founder job health dashboard", () => {
  test("renders durable scheduler health and alert fields from the protected snapshot", () => {
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

  test("explains safe actions and handles empty or partial telemetry without exposing internals", () => {
    const page = read("app/dashboard/page.tsx");

    expect(page).toContain("No scheduled job history is available yet.");
    expect(page).toContain("Operational alert telemetry is unavailable.");
    expect(page).toContain("Do not start a duplicate");
    expect(page).toContain("Do not force an early retry");
    expect(page).toContain("Inspect the correlation trail");
    expect(page).toContain("Correlation unavailable");
    expect(page).not.toContain("payloadSummary");
    expect(page).not.toContain("audit.metadata");
  });

  test("keeps job-health state accessible without relying on color alone", () => {
    const page = read("app/dashboard/page.tsx");

    expect(page).toContain("aria-labelledby=\"job-health-heading\"");
    expect(page).toContain("aria-labelledby=\"operational-alerts-heading\"");
    expect(page).toContain("role=\"status\"");
    expect(page).toContain("Severity:");
    expect(page).toContain("Status:");
  });
});
