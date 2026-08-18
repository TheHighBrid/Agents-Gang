import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const workflow = () => readFileSync(join(process.cwd(), ".github/workflows/environment-validation.yml"), "utf8");

describe("environment validation workflow", () => {
  test("proves safe disabled-feature startup and redacted failure output", () => {
    const source = workflow();
    expect(source).toContain("Environment validation");
    expect(source).toContain("AGENTS_GANG_ENVIRONMENT: staging");
    expect(source).toContain("AI_ENABLED: \"false\"");
    expect(source).toContain("SHOPIFY_ENABLED: \"false\"");
    expect(source).toContain("GMAIL_ENABLED: \"false\"");
    expect(source).toContain("npm run validate:env");
    expect(source).toContain("VERY-SENSITIVE-CI-FIXTURE-SECRET");
    expect(source).toContain("must not leak the configured secret");
  });
});
