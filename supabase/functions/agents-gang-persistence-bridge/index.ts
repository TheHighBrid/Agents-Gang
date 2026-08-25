const FOUNDER_VERIFIER_URL = "https://agents-gang.vercel.app/api/founder/verify";

const DASHBOARD_PROJECTIONS: Record<string, string> = {
  "agent_runs": "id,agent_name,risk_level,status,created_at,completed_at,error_code,duration_ms",
  "approval_requests": "id,agent_name,action_type,target_type,target_id,risk_level,status,created_at,updated_at,decided_at,expires_at",
  "audit_events": "id,run_id,agent_name,tool_name,risk_level,approval_id,event_type,outcome,created_at",
  "routing_decisions": "id,run_id,selected_agent,risk_level,needed_tools,approval_required,created_at",
  "scheduled_jobs": "id,job_name,status,attempt_count,max_attempts,retryable,last_error_code,next_retry_at,updated_at,completed_at",
  "tool_calls": "id,run_id,agent_name,tool_name,capability,risk_level,approval_id,outcome,error_code,created_at",
};

const FOUNDER_APPROVAL_PROJECTION = "id,agent_name,action_type,target_type,target_id,risk_level,payload_summary,status,created_at,updated_at,decided_at,result,expires_at";
const OPERATIONAL_TABLES = new Set(Object.keys(DASHBOARD_PROJECTIONS));
const POST_TABLES = new Set(["agent_runs", "approval_requests", "audit_events", "routing_decisions", "tool_calls"]);
const PATCH_TABLES = new Set(["agent_runs", "approval_requests"]);
const RPC_NAMES = new Set(["claim_scheduled_job", "complete_scheduled_job"]);
const APPROVAL_STATUSES = new Set(["pending", "approved", "rejected", "expired", "consumed"]);

type BridgePayload = {
  path?: unknown;
  method?: unknown;
  body?: unknown;
  prefer?: unknown;
};

type Scope = "founder" | "operator";
type ValidatedOperation = {
  path: string;
  method: "GET" | "POST" | "PATCH";
  scope: Scope;
  table?: string;
};

function json(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function sessionIsValid(request: Request, scope: Scope) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;

  const verifierUrl = scope === "operator"
    ? `${FOUNDER_VERIFIER_URL}?role=operator`
    : FOUNDER_VERIFIER_URL;
  try {
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

function onlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function objectBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validateApprovalQuery(url: URL) {
  const allowed = new Set(["select", "order", "limit", "status", "action_type", "created_at", "or", "id"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return false;
  if (url.searchParams.get("select") !== "*") return false;

  const order = url.searchParams.get("order");
  if (order && order !== "created_at.desc,id.desc") return false;

  const limitText = url.searchParams.get("limit");
  if (limitText) {
    const limit = Number(limitText);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 101) return false;
  }

  const status = url.searchParams.get("status");
  if (status) {
    const match = /^eq\.([a-z_]+)$/.exec(status);
    if (!match || !APPROVAL_STATUSES.has(match[1])) return false;
  }

  const actionType = url.searchParams.get("action_type");
  if (actionType && (!actionType.startsWith("eq.") || actionType.length > 123)) return false;

  for (const createdAt of url.searchParams.getAll("created_at")) {
    if (!/^(gte|lte)\./.test(createdAt) || !Number.isFinite(Date.parse(createdAt.slice(4)))) return false;
  }

  const id = url.searchParams.get("id");
  if (id && (!id.startsWith("eq.") || id.length > 256)) return false;

  const cursor = url.searchParams.get("or");
  if (cursor && (cursor.length > 1_000 || !/^[A-Za-z0-9_.:+(),=-]+$/.test(cursor))) return false;
  return true;
}

function validateDashboardRead(url: URL, table: string) {
  if ([...url.searchParams.keys()].some((key) => !["select", "order"].includes(key))) return null;
  if (url.searchParams.get("select") !== "*") return null;
  const order = url.searchParams.get("order");
  if (order && order !== "created_at.desc") return null;
  const projection = DASHBOARD_PROJECTIONS[table];
  if (!projection) return null;
  url.searchParams.set("select", projection);
  return `${url.pathname}${url.search}`;
}

function validateGetPath(url: URL): ValidatedOperation | null {
  const segments = url.pathname.slice(1).split("/");
  if (segments.length !== 1) return null;
  const table = segments[0] ?? "";
  if (!OPERATIONAL_TABLES.has(table)) return null;

  if (table === "approval_requests") {
    if (!validateApprovalQuery(url)) return null;
    const founderDetail = url.searchParams.has("id") || url.searchParams.has("limit") ||
      url.searchParams.has("status") || url.searchParams.has("action_type") ||
      url.searchParams.has("created_at") || url.searchParams.has("or");
    url.searchParams.set("select", founderDetail ? FOUNDER_APPROVAL_PROJECTION : DASHBOARD_PROJECTIONS.approval_requests);
    return { path: `${url.pathname}${url.search}`, method: "GET", scope: "founder", table };
  }

  const path = validateDashboardRead(url, table);
  return path ? { path, method: "GET", scope: "operator", table } : null;
}

function validatePost(pathname: string, body: Record<string, unknown>): ValidatedOperation | null {
  const segments = pathname.slice(1).split("/");
  if (segments[0] === "rpc" && segments.length === 2 && RPC_NAMES.has(segments[1] ?? "")) {
    const rpc = segments[1]!;
    const allowed = rpc === "claim_scheduled_job"
      ? new Set(["p_job_name", "p_idempotency_key", "p_agent_name", "p_max_attempts", "p_lease_seconds"])
      : new Set(["p_job_id", "p_status", "p_retryable", "p_last_error_code", "p_next_retry_at"]);
    return onlyKeys(body, allowed) ? { path: pathname, method: "POST", scope: "operator" } : null;
  }

  if (segments.length !== 1 || !POST_TABLES.has(segments[0] ?? "")) return null;
  const table = segments[0]!;
  const allowedByTable: Record<string, ReadonlySet<string>> = {
    agent_runs: new Set(["agent_name", "provider", "model", "route_agent", "risk_level", "input_summary"]),
    approval_requests: new Set(["agent_name", "action_type", "target_type", "target_id", "risk_level", "payload_summary"]),
    audit_events: new Set(["run_id", "agent_name", "tool_name", "risk_level", "approval_id", "event_type", "outcome", "metadata"]),
    routing_decisions: new Set(["run_id", "selected_agent", "risk_level", "reason", "needed_tools", "approval_required"]),
    tool_calls: new Set(["run_id", "agent_name", "tool_name", "capability", "risk_level", "approval_id", "outcome", "error_code"]),
  };
  return onlyKeys(body, allowedByTable[table] ?? new Set())
    ? { path: pathname, method: "POST", scope: "operator", table }
    : null;
}

function validatePatch(url: URL, body: Record<string, unknown>): ValidatedOperation | null {
  const segments = url.pathname.slice(1).split("/");
  if (segments.length !== 1 || !PATCH_TABLES.has(segments[0] ?? "")) return null;
  const table = segments[0]!;
  if ([...url.searchParams.keys()].some((key) => !["id", "status"].includes(key))) return null;
  const id = url.searchParams.get("id");
  const statusFilter = url.searchParams.get("status");
  if (!id?.startsWith("eq.") || id.length > 256) return null;

  if (table === "agent_runs") {
    const allowed = new Set(["status", "completed_at", "output_summary", "error_code", "duration_ms"]);
    if (statusFilter !== "eq.running" || !onlyKeys(body, allowed)) return null;
    return { path: `${url.pathname}${url.search}`, method: "PATCH", scope: "operator", table };
  }

  if (table === "approval_requests") {
    if (statusFilter === "eq.pending") {
      const allowed = new Set(["status", "result", "decided_at", "updated_at"]);
      if (!onlyKeys(body, allowed) || (body.status !== "approved" && body.status !== "rejected")) return null;
      return { path: `${url.pathname}${url.search}`, method: "PATCH", scope: "founder", table };
    }
    if (statusFilter === "eq.approved") {
      const allowed = new Set(["status", "updated_at"]);
      if (!onlyKeys(body, allowed) || body.status !== "consumed") return null;
      return { path: `${url.pathname}${url.search}`, method: "PATCH", scope: "operator", table };
    }
  }
  return null;
}

function validatedOperation(payload: BridgePayload): ValidatedOperation | null {
  if (typeof payload.path !== "string" || payload.path.length > 2_048 || !payload.path.startsWith("/")) return null;
  if (typeof payload.method !== "string") return null;
  const method = payload.method.toUpperCase();
  if (method !== "GET" && method !== "POST" && method !== "PATCH") return null;
  if (payload.prefer !== undefined && payload.prefer !== "return=representation") return null;

  let url: URL;
  try {
    url = new URL(payload.path, "https://persistence.invalid");
  } catch {
    return null;
  }

  if (method === "GET") {
    if (payload.body !== undefined) return null;
    return validateGetPath(url);
  }

  const body = objectBody(payload.body);
  if (!body) return null;
  return method === "POST"
    ? validatePost(`${url.pathname}${url.search}`, body)
    : validatePatch(url, body);
}

function dashboardSafeResponse(table: string | undefined, rows: unknown) {
  if (!Array.isArray(rows)) return rows;
  if (table === "audit_events") return rows.map((row) => ({ ...(row as object), metadata: {} }));
  if (table === "routing_decisions") return rows.map((row) => ({ ...(row as object), reason: "" }));
  return rows;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json("Method not allowed", 405);

  let payload: BridgePayload;
  try {
    payload = await request.json();
  } catch {
    return json("Invalid request", 400);
  }

  const query = validatedOperation(payload);
  if (!query) return json("Persistence operation is not allowed", 403);
  if (!(await sessionIsValid(request, query.scope))) {
    return json(query.scope === "founder" ? "Founder authentication required" : "Operator authentication required", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) return json("Bridge is not configured", 503);

  try {
    const headers: Record<string, string> = {
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
      "User-Agent": "agents-gang-supabase-persistence-bridge",
    };
    if (!serviceRoleKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${serviceRoleKey}`;
    if (payload.prefer === "return=representation") headers.Prefer = payload.prefer;

    const response = await fetch(`${supabaseUrl}/rest/v1${query.path}`, {
      method: query.method,
      headers,
      ...(payload.body !== undefined ? { body: JSON.stringify(payload.body) } : {}),
    });
    const contentType = response.headers.get("Content-Type") ?? "application/json";
    if (!response.ok || query.method !== "GET") {
      return new Response(response.body, {
        status: response.status,
        headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
      });
    }
    return Response.json(dashboardSafeResponse(query.table, await response.json()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return json("Persistence service unavailable", 502);
  }
});
