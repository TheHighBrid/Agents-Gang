import { randomUUID } from "node:crypto";
import {
  createFounderSessionToken,
  founderAccessSecretMatches,
  type FounderSessionClaims,
} from "../../../../lib/approvals/auth";

const SESSION_TTL_SECONDS = 15 * 60;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  if (process.env.AGENTS_GANG_ENVIRONMENT?.trim() !== "staging") {
    return json({ error: "Not found" }, 404);
  }

  const configuredAccessSecret = process.env.FOUNDER_AUTH_SECRET;
  if (!configuredAccessSecret?.trim()) {
    return json({ error: "Founder sign-in is unavailable" }, 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid sign-in request" }, 400);
  }

  if (!body || typeof body !== "object") {
    return json({ error: "Invalid sign-in request" }, 400);
  }

  const accessSecret = (body as { accessSecret?: unknown }).accessSecret;
  if (typeof accessSecret !== "string" || accessSecret.length === 0 || accessSecret.length > 512) {
    return json({ error: "Invalid sign-in request" }, 400);
  }

  if (!founderAccessSecretMatches(accessSecret, configuredAccessSecret)) {
    return json({ error: "Founder authentication failed" }, 401);
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: FounderSessionClaims = {
    subject: "founder-staging",
    role: "founder",
    sessionId: randomUUID(),
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL_SECONDS,
  };
  const token = createFounderSessionToken(claims, configuredAccessSecret);

  return json({ token, expiresAt: claims.expiresAt });
}
