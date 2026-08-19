import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function readRepositoryFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("operations runbook documentation", () => {
  test("provides deployment, rollback, incident, mutation-disable, and handover procedures without authorizing an unrehearsed release", () => {
    const runbook = readRepositoryFile("docs/OPERATIONS_RUNBOOK.md");

    expect(runbook).toContain("## Release posture and authority");
    expect(runbook).toContain("**Prepared but unrehearsed.**");
    expect(runbook).toContain("does not authorize a production deployment");
    expect(runbook).toContain("## Deployment runbook");
    expect(runbook).toContain("## Rollback runbook");
    expect(runbook).toContain("## Incident response runbook");
    expect(runbook).toContain("## Operations handover");
    expect(runbook).toContain("GMAIL_SEND_ENABLED=false");
    expect(runbook).toContain("SHOPIFY_STORE_MODE=test");
    expect(runbook).toContain("FOUNDER_REVOKED_SESSION_IDS");
    expect(runbook).toContain("npm run db:migrate -- fresh");
    expect(runbook).toContain("npm run db:migrate -- upgrade --from 20260815_governed_execution");
    expect(runbook).toContain("20260817_approval_consumption");
    expect(runbook).toContain("20260818_scheduler_reliability");
    expect(runbook).toContain("npm run db:verify");
    expect(runbook).toContain("RC-09");
  });

  test("links the C5-05 in-progress runbook evidence without falsely changing release evidence to verified", () => {
    const tracker = readRepositoryFile("docs/TASK_TRACKER.md");
    const register = readRepositoryFile("docs/RELEASE_EVIDENCE_REGISTER.md");
    const readme = readRepositoryFile("README.md");

    expect(tracker).toMatch(/\| C5-05 \|.*\| In progress \|/);
    expect(register).toContain("### EV-C5-05-01 - Operations runbook preparation");
    expect(register).toContain("- Status: In progress");
    expect(register).toContain("OPERATIONS_RUNBOOK.md");
    expect(register).not.toMatch(/RC-09[^\n]*\| Verified \|/);
    expect(readme).toContain("docs/OPERATIONS_RUNBOOK.md");
  });
});
