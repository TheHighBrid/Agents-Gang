import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("migration rehearsal workflow", () => {
  test("rehearses fresh and prior-governed upgrade paths against disposable Postgres", () => {
    const workflow = read(".github/workflows/migration-rehearsal.yml");

    expect(workflow).toContain("postgres:16-alpine");
    expect(workflow).toContain("migration-fresh");
    expect(workflow).toContain("migration-upgrade");
    expect(workflow).toContain("bundle fresh");
    expect(workflow).toContain("bundle upgrade --from 20260815_governed_execution");
    expect(workflow).toContain("db/fixtures/20260815_governed_execution_baseline.sql");
    expect(workflow).toContain("Agents-Gang schema verification passed");
  });
});
