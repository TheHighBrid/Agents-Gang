import {
  copyFileSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { inspectGovernancePolicy } from "../scripts/check-ai-governance.mjs";
import { createReleaseManifest } from "../scripts/create-release-manifest.mjs";

const root = process.cwd();
const locked = [
  "AI_OPERATOR_GOVERNANCE.md",
  "AGENTS.md",
  "CLAUDE.md",
  "GROK.md",
  "MANUS.md",
];

function governanceFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "agents-gang-governance-"));
  for (const path of locked) copyFileSync(join(root, path), join(fixtureRoot, path));
  return fixtureRoot;
}

describe("AI governance CI policy", () => {
  test("accepts the canonical governance bootstrap set", () => {
    const result = inspectGovernancePolicy(root);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.symlinkInstructionFiles).toEqual([]);
    expect(result.instructionFiles).toEqual(expect.arrayContaining([
      "AGENTS.md",
      "CLAUDE.md",
      "GROK.md",
      "MANUS.md",
    ]));
  });

  test("fails closed when the canonical AGENTS bootstrap is removed", () => {
    const fixtureRoot = governanceFixture();
    try {
      unlinkSync(join(fixtureRoot, "AGENTS.md"));
      const result = inspectGovernancePolicy(fixtureRoot);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("missing required governance bootstrap: AGENTS.md");
      expect(() => createReleaseManifest(fixtureRoot, {
        candidateSha: "a".repeat(40),
        eventName: "pull_request",
        refName: "feature",
        runId: "1",
      })).toThrow(/AI governance policy failed/);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("rejects a changed locked bootstrap until the governance lock is intentionally updated", () => {
    const fixtureRoot = governanceFixture();
    try {
      writeFileSync(join(fixtureRoot, "AGENTS.md"), "replacement instructions\n", "utf8");
      const result = inspectGovernancePolicy(fixtureRoot);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("governance bootstrap changed without lock update: AGENTS.md");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("rejects newly introduced agent instruction entry points by default", () => {
    const fixtureRoot = governanceFixture();
    try {
      writeFileSync(join(fixtureRoot, "CODEX.md"), "# New agent instructions\n", "utf8");
      const result = inspectGovernancePolicy(fixtureRoot);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("unapproved agent instruction bootstrap: CODEX.md");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("rejects higher-priority AGENTS.override.md instructions", () => {
    const fixtureRoot = governanceFixture();
    try {
      writeFileSync(join(fixtureRoot, "AGENTS.override.md"), "# Override canonical governance\n", "utf8");
      const result = inspectGovernancePolicy(fixtureRoot);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("unapproved agent instruction bootstrap: AGENTS.override.md");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("rejects symlinked recognized instruction bootstraps", () => {
    const fixtureRoot = governanceFixture();
    try {
      symlinkSync("AGENTS.md", join(fixtureRoot, "CODEX.md"));
      const result = inspectGovernancePolicy(fixtureRoot);
      expect(result.ok).toBe(false);
      expect(result.symlinkInstructionFiles).toContain("CODEX.md");
      expect(result.errors).toContain("symbolic-link agent instruction bootstrap is forbidden: CODEX.md");
      expect(result.errors).toContain("unapproved agent instruction bootstrap: CODEX.md");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
