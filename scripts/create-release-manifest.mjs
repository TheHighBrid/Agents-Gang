#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(scriptPath, "../..");

const requiredGates = Object.freeze([
  "repository-quality",
  "environment-policy",
  "migration-fresh",
  "migration-upgrade",
  "dependency-policy",
  "secret-policy",
]);

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function provenancePaths(root) {
  const migrationDirectory = join(root, "db/migrations");
  const workflowDirectory = join(root, ".github/workflows");
  return [
    "package.json",
    "package-lock.json",
    "db/schema.sql",
    "db/verify.sql",
    ...readdirSync(migrationDirectory)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => `db/migrations/${name}`),
    ...readdirSync(workflowDirectory)
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .sort()
      .map((name) => `.github/workflows/${name}`),
  ];
}

export function createReleaseManifest(root = defaultRoot, options = {}) {
  const candidateSha = options.candidateSha ?? process.env.GITHUB_SHA ?? "";
  const eventName = options.eventName ?? process.env.GITHUB_EVENT_NAME ?? "local";
  const refName = options.refName ?? process.env.GITHUB_REF_NAME ?? "local";
  const workflowRunId = options.runId ?? process.env.GITHUB_RUN_ID ?? "local";
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  if (!/^[0-9a-f]{40}$/i.test(candidateSha)) {
    throw new Error("Release candidate SHA must be a full 40-character commit SHA");
  }

  const files = Object.fromEntries(
    provenancePaths(root).map((path) => [path, sha256(join(root, path))]),
  );

  return {
    schemaVersion: 1,
    candidateSha: candidateSha.toLowerCase(),
    generatedAt,
    eventName,
    refName,
    workflowRunId: String(workflowRunId),
    releaseEligible: refName === "main" && (eventName === "push" || eventName === "workflow_dispatch"),
    requiredGates: [...requiredGates],
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    files,
  };
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const args = process.argv.slice(2);
    const output = argumentValue(args, "--output") ?? "release-evidence/release-manifest.json";
    const manifest = createReleaseManifest(defaultRoot, {
      candidateSha: argumentValue(args, "--sha") ?? process.env.GITHUB_SHA,
      eventName: argumentValue(args, "--event") ?? process.env.GITHUB_EVENT_NAME,
      refName: argumentValue(args, "--ref") ?? process.env.GITHUB_REF_NAME,
      runId: argumentValue(args, "--run-id") ?? process.env.GITHUB_RUN_ID,
    });
    const outputPath = join(defaultRoot, output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Release provenance manifest written to ${relative(defaultRoot, outputPath)}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Release manifest generation failed");
    process.exitCode = 1;
  }
}
