import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { environmentInventory } from "../lib/config/environment.mjs";

const root = process.cwd();
const textRoots = ["app", "agents", "jobs", "lib", "memory", "tools", "docs", "scripts", "tests"];

function collectFiles(path: string): string[] {
  const absolute = join(root, path);
  if (statSync(absolute).isFile()) return [absolute];
  return readdirSync(absolute).flatMap((name) => collectFiles(join(path, name)));
}

describe("secret hygiene", () => {
  test("never classifies a browser-exposed NEXT_PUBLIC variable as a secret", () => {
    for (const entry of environmentInventory.filter((item) => item.secret)) {
      expect(entry.variable).not.toMatch(/^NEXT_PUBLIC_/);
    }
  });

  test("keeps example secret values as placeholders", () => {
    const example = readFileSync(join(root, ".env.example"), "utf8");
    const values = new Map(
      example
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );

    for (const entry of environmentInventory.filter((item) => item.secret && item.exampleRequired)) {
      const value = values.get(entry.variable);
      expect(value, `${entry.variable} must exist in .env.example`).toBeDefined();
      expect(value).toMatch(/^(your_|replace_|example_|postgresql:\/\/db_user:db_password@)/i);
    }
  });

  test("does not contain common live-secret signatures in committed text surfaces", () => {
    const files = [join(root, ".env.example"), ...textRoots.flatMap(collectFiles)]
      .filter((path) => /\.(?:ts|tsx|js|mjs|mts|md|sql|yml|yaml|example)$/.test(path));
    const forbidden = [
      /sk-ant-[A-Za-z0-9_-]{20,}/,
      /shpat_[A-Za-z0-9]{20,}/,
      /ghp_[A-Za-z0-9]{30,}/,
      /AKIA[0-9A-Z]{16}/,
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    ];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbidden) expect(content, file).not.toMatch(pattern);
    }
  });
});
