import { readFileSync } from "node:fs";
import { join } from "node:path";

const memoryFiles = [
  "brandBible.md",
  "productStandards.md",
  "visualStandards.md",
  "customerPolicies.md",
];

export function loadMemory() {
  return memoryFiles
    .map((file) => readFileSync(join(process.cwd(), "memory", file), "utf8"))
    .join("\n\n");
}
