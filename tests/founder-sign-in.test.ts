import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

describe("staging founder sign-in boundary", () => {
  test("dashboard accepts only a locally issued bearer token", () => {
    const page = readFileSync(join(root, "app/dashboard/page.tsx"), "utf8");

    expect(page).toContain("Founder session token");
    expect(page).toContain("npm run founder:session");
    expect(page).toContain("/api/dashboard");
    expect(page).toContain("Authorization: `Bearer ${session}`");
    expect(page).not.toContain("/api/founder/session");
    expect(page).not.toContain("accessSecret");
    expect(page).not.toContain("localStorage");
    expect(page).not.toContain("sessionStorage");
  });

  test("does not expose a browser-facing signing-secret exchange", () => {
    expect(() => readFileSync(join(root, "app/api/founder/session/route.ts"), "utf8"))
      .toThrow();
  });
});
