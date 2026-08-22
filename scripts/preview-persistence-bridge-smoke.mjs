import { createHmac, randomUUID } from "node:crypto";

if (process.env.VERCEL_ENV === "preview") {
  const founderSecret = (process.env.FOUNDER_AUTH_SECRET ?? "").trim();
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");

  if (!founderSecret || !supabaseUrl) {
    throw new Error("Preview persistence bridge smoke is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    subject: "preview-persistence-bridge-smoke",
    role: "founder",
    sessionId: randomUUID(),
    issuedAt: now,
    expiresAt: now + 60,
  };
  const encodedClaims = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signedPayload = `v1.${encodedClaims}`;
  const signature = createHmac("sha256", founderSecret).update(signedPayload).digest("base64url");
  const token = `${signedPayload}.${signature}`;

  const response = await fetch(`${supabaseUrl}/functions/v1/agents-gang-persistence-bridge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "agents-gang-preview-bridge-smoke",
    },
    body: JSON.stringify({
      path: "/agent_runs?select=*&order=created_at.desc",
      method: "GET",
    }),
    cache: "no-store",
  });

  let rowCount = null;
  let responseKind = "unknown";
  try {
    const body = await response.json();
    if (Array.isArray(body)) {
      rowCount = body.length;
      responseKind = "array";
    } else if (body && typeof body === "object") {
      responseKind = "object";
    }
  } catch {
    responseKind = "non_json";
  }

  console.log("PERSISTENCE_BRIDGE_SMOKE", JSON.stringify({
    status: response.status,
    responseKind,
    rowCount,
  }));

  if (response.status !== 200 || responseKind !== "array") {
    throw new Error(`Persistence bridge smoke failed with status ${response.status}`);
  }
}
