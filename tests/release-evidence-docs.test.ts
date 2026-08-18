import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("release evidence documentation contract", () => {
  it("provides the required evidence templates and explicit verification states", () => {
    const register = read("docs/RELEASE_EVIDENCE_REGISTER.md");

    expect(register).toContain("## Evidence status vocabulary");
    expect(register).toContain("## Chapter acceptance template");
    expect(register).toContain("## Pull-request evidence template");
    expect(register).toContain("## Migration rehearsal template");
    expect(register).toContain("## Staging soak template");
    expect(register).toContain("## Founder UAT template");
    expect(register).toContain("`Planned`");
    expect(register).toContain("`Verified`");
    expect(register).toContain("Evidence location");
  });

  it("maps every release-checklist item to a durable evidence location", () => {
    const register = read("docs/RELEASE_EVIDENCE_REGISTER.md");

    for (let item = 1; item <= 10; item += 1) {
      const id = `RC-${String(item).padStart(2, "0")}`;
      expect(register, `${id} must have an evidence mapping`).toContain(`| ${id} |`);
    }
  });

  it("records Chapter 5 implementation evidence without overstating platform or staging readiness", () => {
    const register = read("docs/RELEASE_EVIDENCE_REGISTER.md");
    const tracker = read("docs/TASK_TRACKER.md");

    for (const id of ["EV-C5-01-01", "EV-C5-02-01", "EV-C5-03-01", "EV-C5-03-02"]) {
      expect(register, `${id} must be recorded`).toContain(`### ${id}`);
    }

    expect(register).toContain("PR #65");
    expect(register).toContain("32137947570");
    expect(register).toContain("sha256:041b4950c6f35c488357ef7244748c5d4dc529a2778551ed661754a444f5631d");
    expect(register).toMatch(/\| RC-07 \|[^\n]+\| Blocked \|/);
    expect(register).toContain("releaseEligible=true");
    expect(register).toContain("GitHub `main` ruleset");
    expect(tracker).toMatch(/\| C5-03 \|[^\n]+\| Blocked \|/);
  });

  it("defines a decision log with the required decision fields", () => {
    const decisionLog = read("docs/DECISION_LOG.md");

    for (const field of [
      "Date",
      "Decision owner",
      "Context",
      "Options",
      "Chosen action",
      "Evidence",
      "Consequences",
    ]) {
      expect(decisionLog).toContain(field);
    }
  });

  it("links the evidence register and decision log from the planning sources of truth", () => {
    const blueprint = read("docs/OPERATING_BLUEPRINT.md");
    const tracker = read("docs/TASK_TRACKER.md");

    for (const document of [blueprint, tracker]) {
      expect(document).toContain("RELEASE_EVIDENCE_REGISTER.md");
      expect(document).toContain("DECISION_LOG.md");
    }
  });
});
