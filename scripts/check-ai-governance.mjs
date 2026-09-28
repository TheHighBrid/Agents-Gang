#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(scriptPath, "../..");

const LOCKED_BOOTSTRAPS = Object.freeze({
  "AI_OPERATOR_GOVERNANCE.md": "e345e4a35e6399596c9de54e377416f1b2b4e0b8",
  "AGENTS.md": "4a1e2e73d7551f2523aebb20a28b5b02e5408fbf",
  "CLAUDE.md": "68de1223091ba51b9fd4f1e1764525c95021b0d2",
  "GROK.md": "b4723fceaa7bc45412cd86447ae41e39a79c1515",
  "MANUS.md": "3c3931938b5f178babf0a7660f8a7f836268addb",
});

const KNOWN_INSTRUCTION_FILES = new Set([
  "agents.md",
  "agents.override.md",
  "chatgpt.md",
  "claude.md",
  "grok.md",
  "manus.md",
  "codex.md",
  "gemini.md",
  "copilot.md",
  "copilot-instructions.md",
  "instructions.md",
]);

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "release-evidence",
]);

function normalizePath(path) {
  return path.split(sep).join("/");
}

function gitBlobSha(content) {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

function isInstructionPath(path) {
  const lowerPath = path.toLowerCase();
  const lowerBase = basename(lowerPath);
  return KNOWN_INSTRUCTION_FILES.has(lowerBase)
    || lowerBase.endsWith(".instructions.md")
    || lowerPath === ".github/instructions"
    || lowerPath.startsWith(".github/instructions/");
}

function walkInstructionFiles(root, directory = root) {
  const paths = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const path = normalizePath(relative(root, absolute));

    if (entry.isSymbolicLink()) {
      if (isInstructionPath(path)) paths.push(path);
      continue;
    }

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      paths.push(...walkInstructionFiles(root, absolute));
      continue;
    }

    if (entry.isFile() && isInstructionPath(path)) paths.push(path);
  }
  return paths.sort();
}

export function inspectGovernancePolicy(root = defaultRoot) {
  const errors = [];

  for (const [path, expectedSha] of Object.entries(LOCKED_BOOTSTRAPS)) {
    const absolute = join(root, path);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      errors.push(`missing required governance bootstrap: ${path}`);
      continue;
    }
    const actualSha = gitBlobSha(readFileSync(absolute, "utf8"));
    if (actualSha !== expectedSha) {
      errors.push(`governance bootstrap changed without lock update: ${path}`);
    }
  }

  const instructionFiles = walkInstructionFiles(root);
  const approved = new Set(Object.keys(LOCKED_BOOTSTRAPS).filter((path) => path !== "AI_OPERATOR_GOVERNANCE.md"));
  for (const path of instructionFiles) {
    if (!approved.has(path)) {
      errors.push(`unapproved agent instruction bootstrap: ${path}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors: errors.sort(),
    instructionFiles,
  };
}

export function assertGovernancePolicy(root = defaultRoot) {
  const result = inspectGovernancePolicy(root);
  if (!result.ok) {
    throw new Error(`AI governance policy failed:\n- ${result.errors.join("\n- ")}`);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const result = assertGovernancePolicy(defaultRoot);
    console.log(`AI governance policy passed. ${result.instructionFiles.length} approved instruction bootstrap file(s) inspected.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "AI governance policy failed");
    process.exitCode = 1;
  }
}
