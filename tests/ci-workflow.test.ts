import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workflowPath = resolve(process.cwd(), ".github/workflows/quality-gate.yml");
const shopifyWorkflowPath = resolve(process.cwd(), ".github/workflows/shopify-integration.yml");

describe("CI quality gate", () => {
  test("runs all required quality stages on pushes and pull requests", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const shopifyWorkflow = await readFile(shopifyWorkflowPath, "utf8");

    expect(workflow).toMatch(/pull_request:/);
    expect(workflow).toMatch(/push:/);
    expect(workflow).toMatch(/name:\s+Lint/);
    expect(workflow).toMatch(/run:\s+npm run lint/);
    expect(workflow).toMatch(/name:\s+Typecheck/);
    expect(workflow).toMatch(/run:\s+npm run typecheck/);
    expect(workflow).toMatch(/name:\s+Build/);
    expect(workflow).toMatch(/run:\s+npm run build/);
    expect(workflow).toMatch(/name:\s+Full Vitest suite/);
    expect(workflow).toMatch(/run:\s+npm test/);
    expect(shopifyWorkflow).toMatch(/name:\s+Shopify integration tests/);
    expect(shopifyWorkflow).toMatch(/run:\s+npm test -- tests\/shopify-tools\.e2e\.test\.ts/);
  });

  test("uses least-privilege permissions, dependency caching, and immutable action pins", async () => {
    const workflow = await readFile(workflowPath, "utf8");

    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s+read/);
    expect(workflow).not.toMatch(/permissions:\s+write-all/);
    expect(workflow).toMatch(/actions\/checkout@[0-9a-f]{40}/);
    expect(workflow).toMatch(/actions\/setup-node@[0-9a-f]{40}/);
    expect(workflow).not.toMatch(/actions\/(checkout|setup-node)@v\d+/);
    expect(workflow).toMatch(/cache:\s+npm/);
  });
});
