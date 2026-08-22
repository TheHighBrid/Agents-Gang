import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

describe("dashboard staging persistence bridge", () => {
  test("passes the authenticated founder bearer session into repository creation", () => {
    const route = readFileSync(join(root, "app/api/dashboard/route.ts"), "utf8");

    expect(route).toContain('request.headers.get("authorization")');
    expect(route).toContain("founderAuthorization");
    expect(route.indexOf("authorizeFounderRequest(request, process.env)")).toBeLessThan(
      route.indexOf("createExecutionRepository(process.env"),
    );
  });
});
