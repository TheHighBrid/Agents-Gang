const ALLOWED_TABLES = new Set([
  "agent_runs",
  "approval_requests",
  "audit_events",
  "routing_decisions",
  "scheduled_jobs",
  "tool_calls",
]);

type SessionClaims = {
  role: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
};

function json(error: string, status: number) {
  return Response.json({ error }, { status });
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)));
}

function decodeSignature(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function authorize(request: Request, secret: string, revokedSessions: Set<string>) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const token = authorization.slice("Bearer ".length).trim();
  const [version, payload, signature, ...extra] = token.split(".");
  if (version !== "v1" || !payload || !signature || extra.length) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeSignature(signature),
      new TextEncoder().encode(`${version}.${payload}`),
    );
    if (!validSignature) return false;

    const claims = JSON.parse(decodeBase64Url(payload)) as SessionClaims;
    return claims.role === "founder" &&
      typeof claims.sessionId === "string" &&
      !revokedSessions.has(claims.sessionId) &&
      Number.isSafeInteger(claims.issuedAt) &&
      Number.isSafeInteger(claims.expiresAt) &&
      claims.expiresAt > claims.issuedAt &&
      claims.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function validatedPath(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048 || !value.startsWith("/")) return null;

  let url: URL;
  try {
    url = new URL(value, "https://persistence.invalid");
  } catch {
    return null;
  }

  const segments = url.pathname.slice(1).split("/");
  if (segments.length !== 1 || !ALLOWED_TABLES.has(segments[0] ?? "")) return null;
  if (url.searchParams.get("select") !== "*") return null;
  if ([...url.searchParams.keys()].some((key) => !["select", "order"].includes(key))) return null;
  return `${url.pathname}${url.search}`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json("Method not allowed", 405);

  const founderSecret = Deno.env.get("FOUNDER_AUTH_SECRET")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!founderSecret || !supabaseUrl || !serviceRoleKey) return json("Bridge is not configured", 503);

  const revokedSessions = new Set(
    (Deno.env.get("FOUNDER_REVOKED_SESSION_IDS") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
  );
  if (!(await authorize(request, founderSecret, revokedSessions))) return json("Founder authentication required", 401);

  let body: { path?: unknown; method?: unknown };
  try {
    body = await request.json();
  } catch {
    return json("Invalid request", 400);
  }

  if (body.method !== "GET") return json("Bridge is read-only", 403);
  const path = validatedPath(body.path);
  if (!path) return json("Invalid persistence path", 400);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
      method: "GET",
      headers: { apikey: serviceRoleKey },
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return json("Persistence service unavailable", 502);
  }
});
