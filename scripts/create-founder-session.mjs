#!/usr/bin/env node

import { createHmac, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 15 * 60;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 60 * 60;
const SUBJECT_PATTERN = /^[A-Za-z0-9._:@-]{1,128}$/;

function encode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function requireSecret(secret) {
  if (typeof secret !== "string" || !secret.trim()) {
    throw new Error("FOUNDER_AUTH_SECRET is required in the environment");
  }
  if (secret.length < 32) {
    throw new Error("FOUNDER_AUTH_SECRET must be at least 32 characters");
  }
  return secret;
}

function requireSubject(subject) {
  if (typeof subject !== "string" || !SUBJECT_PATTERN.test(subject)) {
    throw new Error("Founder session subject must be 1-128 safe identifier characters");
  }
  return subject;
}

function requireTtl(ttlSeconds) {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < MIN_TTL_SECONDS || ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error(`Founder session TTL must be an integer between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS} seconds`);
  }
  return ttlSeconds;
}

export function issueFounderSession({
  secret,
  subject = "founder",
  ttlSeconds = DEFAULT_TTL_SECONDS,
  now = Math.floor(Date.now() / 1000),
  sessionId = randomUUID(),
}) {
  const validatedSecret = requireSecret(secret);
  const validatedSubject = requireSubject(subject);
  const validatedTtl = requireTtl(ttlSeconds);
  if (!Number.isSafeInteger(now)) throw new Error("Founder session issuance time must be an integer Unix timestamp");
  if (typeof sessionId !== "string" || !SUBJECT_PATTERN.test(sessionId)) {
    throw new Error("Founder session ID must be a bounded safe identifier");
  }

  const claims = {
    subject: validatedSubject,
    role: "founder",
    sessionId,
    issuedAt: now,
    expiresAt: now + validatedTtl,
  };
  const payload = encode(JSON.stringify(claims));
  const signedPayload = `${TOKEN_VERSION}.${payload}`;
  return `${signedPayload}.${sign(signedPayload, validatedSecret)}`;
}

export function parseFounderSessionArgs(args) {
  const parsed = { subject: "founder", ttlSeconds: DEFAULT_TTL_SECONDS };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--secret" || argument.startsWith("--secret=")) {
      throw new Error("Founder auth secret must come from the FOUNDER_AUTH_SECRET environment variable, never a command-line argument");
    }
    if (argument === "--subject") {
      parsed.subject = args[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--ttl-seconds") {
      parsed.ttlSeconds = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    throw new Error(`Unknown founder session option: ${argument}`);
  }
  requireSubject(parsed.subject);
  requireTtl(parsed.ttlSeconds);
  return parsed;
}

function usage() {
  return [
    "Usage: npm run founder:session -- [--subject founder-uat] [--ttl-seconds 900]",
    "",
    "Security:",
    "  - FOUNDER_AUTH_SECRET must be supplied through the environment.",
    "  - Do not pass the secret as an argument or paste it into logs/evidence.",
    "  - The issued bearer token is sensitive and expires in 15 minutes by default.",
    "  - Maximum lifetime is 60 minutes.",
  ].join("\n");
}

function run() {
  const parsed = parseFounderSessionArgs(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const token = issueFounderSession({
    secret: process.env.FOUNDER_AUTH_SECRET,
    subject: parsed.subject,
    ttlSeconds: parsed.ttlSeconds,
  });
  process.stdout.write(`${token}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unable to issue founder session");
    process.exitCode = 1;
  }
}
