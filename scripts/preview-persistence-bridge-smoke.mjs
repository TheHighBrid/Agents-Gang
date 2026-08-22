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
  const authorization = `Bearer ${signedPayload}.${signature}`;
  const bridgeUrl = `${supabaseUrl}/functions/v1/agents-gang-persistence-bridge`;

  const readPaths = [
    "/agent_runs?select=*&order=created_at.desc",
    "/routing_decisions?select=*&order=created_at.desc",
    "/tool_calls?select=*&order=created_at.desc",
    "/audit_events?select=*&order=created_at.desc",
    "/approval_requests?select=*&order=created_at.desc,id.desc",
    "/scheduled_jobs?select=*&order=created_at.desc",
  ];

  async function call(body, auth = authorization) {
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "agents-gang-preview-bridge-smoke",
    };
    if (auth) headers.Authorization = auth;
    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    let kind = "unknown";
    let rowCount = null;
    try {
      const parsed = await response.json();
      if (Array.isArray(parsed)) {
        kind = "array";
        rowCount = parsed.length;
      } else if (parsed && typeof parsed === "object") {
        kind = "object";
      }
    } catch {
      kind = "non_json";
    }
    return { status: response.status, kind, rowCount };
  }

  const reads = [];
  for (const path of readPaths) {
    const result = await call({ path, method: "GET" });
    reads.push({ path: path.split("?")[0], ...result });
    if (result.status !== 200 || result.kind !== "array") {
      throw new Error(`Persistence bridge read smoke failed for ${path.split("?")[0]} with status ${result.status}`);
    }
  }

  const unauthorized = await call({ path: readPaths[0], method: "GET" }, "");
  if (unauthorized.status !== 401) {
    throw new Error(`Persistence bridge unauthorized boundary returned ${unauthorized.status}`);
  }

  const writeBlocked = await call({ path: "/agent_runs", method: "POST" });
  if (writeBlocked.status !== 403) {
    throw new Error(`Persistence bridge write boundary returned ${writeBlocked.status}`);
  }

  console.log("PERSISTENCE_BRIDGE_MATRIX", JSON.stringify({
    reads,
    unauthorizedStatus: unauthorized.status,
    writeBlockedStatus: writeBlocked.status,
  }));
}
