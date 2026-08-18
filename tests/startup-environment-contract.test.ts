import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const source = () => readFileSync(join(process.cwd(), "instrumentation.ts"), "utf8");

describe("startup environment validation", () => {
  test("validates staging and production on the server without blocking development builds", () => {
    const instrumentation = source();
    expect(instrumentation).toContain("assertDeploymentEnvironment");
    expect(instrumentation).toContain("AGENTS_GANG_ENVIRONMENT");
    expect(instrumentation).toContain('target === "staging" || target === "production"');
    expect(instrumentation).toContain('process.env.NEXT_RUNTIME !== "nodejs"');
    expect(instrumentation).toContain("return;");
  });
});
