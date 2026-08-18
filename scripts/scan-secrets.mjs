#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(scriptPath, "../..");

const rules = Object.freeze([
  { name: "anthropic_api_key", pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "shopify_admin_token", pattern: /shpat_[A-Za-z0-9]{20,}/g },
  { name: "github_token", pattern: /ghp_[A-Za-z0-9]{30,}/g },
  { name: "aws_access_key", pattern: /AKIA[0-9A-Z]{16}/g },
  { name: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
]);

const textExtensions = new Set([
  "", ".env", ".example", ".json", ".js", ".jsx", ".md", ".mjs", ".mts", ".sql", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);

function lineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

export function scanContentForSecrets(path, content) {
  const findings = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      findings.push({
        path,
        rule: rule.name,
        line: lineNumber(content, match.index ?? 0),
      });
    }
  }
  return findings.sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
}

function trackedFiles(root) {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Unable to enumerate tracked files for secret scanning");
  return result.stdout.split("\0").filter(Boolean);
}

function shouldScan(path) {
  if (path === ".env.example") return true;
  if (/^\.env(?:\.|$)/.test(path)) return true;
  return textExtensions.has(extname(path).toLowerCase());
}

export function scanTrackedFiles(root = defaultRoot) {
  const findings = [];
  const policyErrors = [];

  for (const path of trackedFiles(root)) {
    if (/^\.env(?:\.|$)/.test(path) && path !== ".env.example") {
      policyErrors.push({ path, rule: "tracked_environment_file", line: 1 });
    }
    if (!shouldScan(path)) continue;

    let content;
    try {
      content = readFileSync(resolve(root, path), "utf8");
    } catch {
      continue;
    }
    findings.push(...scanContentForSecrets(path, content));
  }

  return [...policyErrors, ...findings].sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const findings = scanTrackedFiles(defaultRoot);
  if (findings.length) {
    console.error(`Committed secret scan failed with ${findings.length} finding${findings.length === 1 ? "" : "s"}.`);
    for (const finding of findings) {
      console.error(`- ${finding.path}:${finding.line} [${finding.rule}]`);
    }
    process.exitCode = 1;
  } else {
    console.log("Committed secret scan passed with no high-confidence findings.");
  }
}
