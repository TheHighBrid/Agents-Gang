import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("deployed founder write-route authorization", () => {
  test("approval list and decision routes enforce founder auth and pass the bearer session to storage", () => {
    const listRoute = read("app/api/approvals/route.ts");
    const decisionRoute = read("app/api/approvals/[approvalId]/route.ts");

    for (const route of [listRoute, decisionRoute]) {
      expect(route).not.toContain('process.env.NODE_ENV === "test"');
      expect(route).not.toContain('process.env.NODE_ENV !== "test"');
      expect(route).not.toContain('"testing-mode"');
      expect(route).toContain("authorizeFounderRequest(request, process.env)");
      expect(route).toContain("founderAuthorization");
      expect(route).toContain('request.headers.get("authorization")');
    }
  });

  test("manual job controls enforce operator auth and pass the bearer session to storage", () => {
    const route = read("app/api/jobs/route.ts");

    expect(route).not.toContain('process.env.NODE_ENV !== "test"');
    expect(route).not.toContain('"testing-mode"');
    expect(route).toContain("authorizeOperatorRequest(request, process.env)");
    expect(route).toContain("operatorAuthorizationResponse");
    expect(route).toContain("founderAuthorization");
    expect(route).toContain('request.headers.get("authorization")');
  });
});
