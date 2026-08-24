const DASHBOARD_PROJECTIONS: Record<string, string> = {
  "agent_runs": "id,agent_name,risk_level,status,created_at,completed_at,error_code,duration_ms",
  "approval_requests": "id,agent_name,action_type,target_type,target_id,risk_level,status,created_at,updated_at,decided_at,expires_at",
  "audit_events": "id,run_id,agent_name,tool_name,risk_level,approval_id,event_type,outcome,created_at",
  "routing_decisions": "id,run_id,selected_agent,risk_level,needed_tools,approval_required,created_at",
  "scheduled_jobs": "id,job_name,status,attempt_count,max_attempts,retryable,last_error_code,next_retry_at,updated_at,completed_at",
  "tool_calls": "id,run_id,agent_name,tool_name,capability,risk_level,approval_id,outcome,error_code,created_at",
};

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
  const table = segments[0] ?? "";
  const projection = DASHBOARD_PROJECTIONS[table];
  if (segments.length !== 1 || !projection) return null;
  if (url.searchParams.get("select") !== "*") return null;
  if ([...url.searchParams.keys()].some((key) => !["select", "order"].includes(key))) return null;
  url.searchParams.set("select", projection);
  return { path: `${url.pathname}${url.search}`, table };
}

function dashboardSafeResponse(table: string, rows: unknown) {
  if (!Array.isArray(rows)) return rows;
  // Repository adapters expect these properties even though the dashboard never
  // receives the underlying sensitive values.
  if (table === "audit_events") return rows.map((row) => ({ ...(row as object), metadata: {} }));
  if (table === "routing_decisions") return rows.map((row) => ({ ...(row as object), reason: "" }));
  return rows;
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
  const query = validatedPath(body.path);
  if (!query) return json("Invalid persistence path", 400);

  try {
    const headers: Record<string, string> = { apikey: serviceRoleKey };
    if (!serviceRoleKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${serviceRoleKey}`;
    const response = await fetch(`${supabaseUrl}/rest/v1${query.path}`, {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
      });
    }
    return Response.json(dashboardSafeResponse(query.table, await response.json()));
  } catch {
    return json("Persistence service unavailable", 502);
  }
});
