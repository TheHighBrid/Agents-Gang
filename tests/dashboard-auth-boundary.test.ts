import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

describe("dashboard founder authorization boundary", () => {
  test("authorization is enforced in deployed runtimes rather than only under NODE_ENV=test", () => {
    const route = readFileSync(join(root, "app/api/dashboard/route.ts"), "utf8");

    expect(route).toContain("authorizeFounderRequest(request, process.env)");
    expect(route).toContain("founderAuthorizationResponse");
    expect(route).not.toContain('process.env.NODE_ENV === "test"');
    expect(route.indexOf("authorizeFounderRequest(request, process.env)")).toBeLessThan(
      route.indexOf("createExecutionRepository(process.env"),
    );
  });
});
