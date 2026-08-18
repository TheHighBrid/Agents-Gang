import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  inspectLockfilePolicy,
  inspectWorkflowPins,
} from "../scripts/check-supply-chain.mjs";
import { createReleaseManifest } from "../scripts/create-release-manifest.mjs";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("release gate policy", () => {
  test("defines an independent release-candidate gate with least privilege and all release checks", () => {
    const workflow = read(".github/workflows/release-gate.yml");

    expect(workflow).toContain("name: Release gate");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).toContain("repository-quality");
    expect(workflow).toContain("environment-policy");
    expect(workflow).toContain("migration-fresh");
    expect(workflow).toContain("migration-upgrade");
    expect(workflow).toContain("dependency-policy");
    expect(workflow).toContain("secret-policy");
    expect(workflow).toContain("release-manifest");
    expect(workflow).toContain("npm audit --audit-level=high");
    expect(workflow).toContain("node scripts/scan-secrets.mjs");
    expect(workflow).toContain("node scripts/check-supply-chain.mjs");
    expect(workflow).toContain("node scripts/db-migrate.mjs bundle fresh");
    expect(workflow).toContain("node scripts/db-migrate.mjs bundle upgrade --from 20260815_governed_execution");
    expect(workflow).toContain("retention-days: 90");
  });

  test("pins every workflow action to an immutable 40-character commit", () => {
    const result = inspectWorkflowPins(root);
    expect(result.errors).toEqual([]);
    expect(result.actions.length).toBeGreaterThan(0);
    for (const action of result.actions) expect(action.ref).toMatch(/^[0-9a-f]{40}$/);
  });

  test("keeps package.json and package-lock root dependency policy aligned", () => {
    expect(inspectLockfilePolicy(root)).toEqual({ ok: true, errors: [] });
  });

  test("release manifest retains candidate and supply-chain provenance without secrets", () => {
    const manifest = createReleaseManifest(root, {
      candidateSha: "a".repeat(40),
      eventName: "push",
      refName: "main",
      runId: "12345",
      generatedAt: "2026-08-18T06:00:00.000Z",
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      candidateSha: "a".repeat(40),
      eventName: "push",
      refName: "main",
      releaseEligible: true,
      workflowRunId: "12345",
      requiredGates: [
        "repository-quality",
        "environment-policy",
        "migration-fresh",
        "migration-upgrade",
        "dependency-policy",
        "secret-policy",
      ],
    });
    expect(manifest.files["package-lock.json"]).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files["db/schema.sql"]).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(manifest.files)).toEqual(expect.arrayContaining([
      "db/migrations/20260817_approval_consumption_up.sql",
      "db/migrations/20260818_scheduler_reliability_up.sql",
      ".github/workflows/quality-gate.yml",
      ".github/workflows/environment-validation.yml",
      ".github/workflows/migration-rehearsal.yml",
      ".github/workflows/release-gate.yml",
    ]));
    expect(JSON.stringify(manifest)).not.toMatch(/token|password|service-role-secret/i);
  });

  test("all workflow files participate in immutable-action policy", () => {
    const workflowNames = readdirSync(join(root, ".github/workflows")).filter((name) => name.endsWith(".yml"));
    const inspected = inspectWorkflowPins(root).workflows.map((path) => path.split("/").pop());
    expect(inspected.sort()).toEqual(workflowNames.sort());
  });
});
