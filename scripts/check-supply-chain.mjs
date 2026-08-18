#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(scriptPath, "../..");

function stableEntries(value = {}) {
  return Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
}

function sameDependencyMap(left = {}, right = {}) {
  const leftEntries = stableEntries(left);
  const rightEntries = stableEntries(right);
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

export function inspectLockfilePolicy(root = defaultRoot) {
  const errors = [];
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const lockRoot = lock.packages?.[""];

  if (!lockRoot) errors.push("package-lock.json is missing the root package entry");
  if (!Number.isInteger(lock.lockfileVersion) || lock.lockfileVersion < 3) {
    errors.push("package-lock.json must use lockfileVersion 3 or newer");
  }
  if (lockRoot && manifest.name !== lockRoot.name) errors.push("package name differs between package.json and package-lock.json");
  if (lockRoot && manifest.version !== lockRoot.version) errors.push("package version differs between package.json and package-lock.json");
  if (lockRoot && !sameDependencyMap(manifest.dependencies, lockRoot.dependencies)) {
    errors.push("runtime dependencies differ between package.json and package-lock.json");
  }
  if (lockRoot && !sameDependencyMap(manifest.devDependencies, lockRoot.devDependencies)) {
    errors.push("development dependencies differ between package.json and package-lock.json");
  }

  return { ok: errors.length === 0, errors };
}

export function inspectWorkflowPins(root = defaultRoot) {
  const workflowDirectory = join(root, ".github/workflows");
  const workflows = readdirSync(workflowDirectory)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => relative(root, join(workflowDirectory, name)).replaceAll("\\", "/"));
  const actions = [];
  const errors = [];

  for (const workflow of workflows) {
    const source = readFileSync(join(root, workflow), "utf8");
    for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
      const use = match[1];
      if (use.startsWith("./") || use.startsWith("docker://")) continue;
      const separator = use.lastIndexOf("@");
      if (separator <= 0) {
        errors.push(`${workflow}: action reference is missing an immutable commit: ${use}`);
        continue;
      }
      const action = use.slice(0, separator);
      const ref = use.slice(separator + 1);
      actions.push({ workflow, action, ref });
      if (!/^[0-9a-f]{40}$/.test(ref)) {
        errors.push(`${workflow}: ${action} must be pinned to a full 40-character commit SHA`);
      }
    }
  }

  return { workflows, actions, errors };
}

export function inspectSupplyChain(root = defaultRoot) {
  const lockfile = inspectLockfilePolicy(root);
  const workflows = inspectWorkflowPins(root);
  return {
    ok: lockfile.ok && workflows.errors.length === 0,
    errors: [...lockfile.errors, ...workflows.errors],
    workflowCount: workflows.workflows.length,
    actionCount: workflows.actions.length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const result = inspectSupplyChain(defaultRoot);
  if (!result.ok) {
    console.error("Supply-chain policy failed.");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Supply-chain policy passed: ${result.workflowCount} workflows, ${result.actionCount} pinned action references.`);
  }
}
