import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const FOUNDER_VERIFIER_URL = "https://agents-gang.vercel.app/api/founder/verify";
const READ_TABLES = new Set([
  "/agent_runs",
  "/routing_decisions",
  "/tool_calls",
  "/audit_events",
  "/approval_requests",
  "/scheduled_jobs",
]);
const POST_TABLES = new Set([
  "/agent_runs",
  "/routing_decisions",
  "/tool_calls",
  "/audit_events",
  "/approval_requests",
]);
const PATCH_TABLES = new Set([
  "/agent_runs",
  "/approval_requests",
]);
const RPC_PATHS = new Set([
  "/rpc/claim_scheduled_job",
  "/rpc/complete_scheduled_job",
]);

type BridgePayload = {
  path?: unknown;
  method?: unknown;
  body?: unknown;
  prefer?: unknown;
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function parseOperation(path: string, method: string) {
  let pathname: string;
  try {
    const url = new URL(path, "https://bridge.invalid");
    pathname = url.pathname;
  } catch {
    return null;
  }

  if (method === "GET" && READ_TABLES.has(pathname)) {
    return { pathname, scope: pathname === "/approval_requests" ? "founder" : "operator" } as const;
  }
  if (method === "POST" && (POST_TABLES.has(pathname) || RPC_PATHS.has(pathname))) {
    return { pathname, scope: "operator" } as const;
  }
  if (method === "PATCH" && PATCH_TABLES.has(pathname)) {
    return { pathname, scope: pathname === "/approval_requests" ? "founder" : "operator" } as const;
  }
  return null;
}

async function sessionIsValid(authorization: string, scope: "founder" | "operator") {
  try {
    const verifierUrl = scope === "operator"
      ? `${FOUNDER_VERIFIER_URL}?role=operator`
      : FOUNDER_VERIFIER_URL;
    const response = await fetch(verifierUrl, {
      method: "GET",
      headers: {
        Authorization: authorization,
        "User-Agent": "agents-gang-supabase-persistence-bridge",
      },
      cache: "no-store",
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  let payload: BridgePayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid bridge request" }, 400);
  }

  const path = typeof payload.path === "string" ? payload.path : "";
  const method = typeof payload.method === "string" ? payload.method.toUpperCase() : "";
  const operation = parseOperation(path, method);
  if (!operation) return json({ error: "Persistence operation is not allowed" }, 403);

  if (!(await sessionIsValid(authorization, operation.scope))) {
    return json({ error: operation.scope === "founder" ? "Founder authentication required" : "Operator authentication required" }, 401);
  }

  if (method === "GET" && payload.body !== undefined) {
    return json({ error: "GET persistence requests cannot include a body" }, 400);
  }
  if ((method === "POST" || method === "PATCH") && (!payload.body || typeof payload.body !== "object" || Array.isArray(payload.body))) {
    return json({ error: "Persistence write body must be an object" }, 400);
  }
  if (payload.prefer !== undefined && payload.prefer !== "return=representation") {
    return json({ error: "Persistence preference is not allowed" }, 403);
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  let secretKey = "";
  try {
    const secretKeys = JSON.parse(secretKeysRaw) as Record<string, unknown>;
    secretKey = typeof secretKeys.default === "string" ? secretKeys.default : "";
  } catch {
    return json({ error: "Persistence bridge is not configured" }, 503);
  }
  if (!supabaseUrl || !secretKey.startsWith("sb_secret_")) {
    return json({ error: "Persistence bridge is not configured" }, 503);
  }

  try {
    const headers = new Headers({
      apikey: secretKey,
      "Content-Type": "application/json",
      "User-Agent": "agents-gang-supabase-persistence-bridge",
    });
    if (payload.prefer === "return=representation") headers.set("Prefer", payload.prefer);

    const upstream = await fetch(`${supabaseUrl}/rest/v1${path}`, {
      method,
      headers,
      ...(payload.body !== undefined ? { body: JSON.stringify(payload.body) } : {}),
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", upstream.headers.get("content-type") ?? "application/json");
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return json({ error: "Persistence bridge upstream unavailable" }, 502);
  }
});
