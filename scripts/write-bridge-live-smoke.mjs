import { createHmac, randomUUID } from "node:crypto";

if (process.env.VERCEL_ENV === "preview") {
  const founderSecret = (process.env.FOUNDER_AUTH_SECRET ?? "").trim();
  const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  if (!founderSecret || !supabaseUrl) throw new Error("Live write bridge smoke is not configured");

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    subject: "write-bridge-live-smoke",
    role: "founder",
    sessionId: randomUUID(),
    issuedAt: now,
    expiresAt: now + 120,
  };
  const encodedClaims = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signedPayload = `v1.${encodedClaims}`;
  const signature = createHmac("sha256", founderSecret).update(signedPayload).digest("base64url");
  const authorization = `Bearer ${signedPayload}.${signature}`;
  const bridgeUrl = `${supabaseUrl}/functions/v1/agents-gang-persistence-bridge`;

  async function bridge(payload, auth = authorization) {
    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
        "User-Agent": "agents-gang-write-bridge-live-smoke",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    return { status: response.status, body };
  }

  const stamp = Date.now();
  const createdIds = [];

  async function createApproval(label) {
    const result = await bridge({
      path: "/approval_requests",
      method: "POST",
      prefer: "return=representation",
      body: {
        agent_name: "uat_smoke_agent",
        action_type: `uat.bridge.${label}`,
        target_type: "uat_fixture",
        target_id: `c5-04-${label}-${stamp}`,
        risk_level: 3,
        payload_summary: `C5-04 live ${label} bridge fixture. No external action.`,
      },
    });
    if (![200, 201].includes(result.status) || !Array.isArray(result.body) || result.body.length !== 1 || !result.body[0]?.id) {
      throw new Error(`Create ${label} fixture failed with status ${result.status}`);
    }
    createdIds.push(result.body[0].id);
    return result.body[0].id;
  }

  async function decideApproval(id, status) {
    const timestamp = new Date().toISOString();
    const result = await bridge({
      path: `/approval_requests?id=eq.${encodeURIComponent(id)}&status=eq.pending`,
      method: "PATCH",
      prefer: "return=representation",
      body: {
        status,
        result: `C5-04 live ${status} bridge smoke`,
        decided_at: timestamp,
        updated_at: timestamp,
      },
    });
    if (result.status !== 200 || !Array.isArray(result.body) || result.body.length !== 1 || result.body[0]?.status !== status) {
      throw new Error(`Decision ${status} failed with status ${result.status}`);
    }
  }

  const unauthorized = await bridge({
    path: "/agent_runs?select=*&order=created_at.desc",
    method: "GET",
  }, "");
  if (unauthorized.status !== 401) throw new Error(`Unauthenticated bridge status ${unauthorized.status}`);

  const approveId = await createApproval("approve");
  const approveRead = await bridge({
    path: `/approval_requests?id=eq.${encodeURIComponent(approveId)}&select=*`,
    method: "GET",
  });
  if (approveRead.status !== 200 || !Array.isArray(approveRead.body) || approveRead.body.length !== 1) {
    throw new Error(`Approval read failed with status ${approveRead.status}`);
  }
  await decideApproval(approveId, "approved");

  const rejectId = await createApproval("reject");
  await decideApproval(rejectId, "rejected");

  const audit = await bridge({
    path: "/audit_events",
    method: "POST",
    prefer: "return=representation",
    body: {
      event_type: "uat.persistence_bridge.live_smoke",
      outcome: "succeeded",
      metadata: { fixture: true, approveId, rejectId },
    },
  });
  if (![200, 201].includes(audit.status) || !Array.isArray(audit.body) || audit.body.length !== 1) {
    throw new Error(`Audit write failed with status ${audit.status}`);
  }

  const idempotencyKey = `uat-bridge-${stamp}`;
  const claim = await bridge({
    path: "/rpc/claim_scheduled_job",
    method: "POST",
    body: {
      p_job_name: "uat_bridge_live_smoke",
      p_idempotency_key: idempotencyKey,
      p_agent_name: "uat_smoke_agent",
      p_max_attempts: 1,
      p_lease_seconds: 60,
    },
  });
  if (claim.status !== 200 || !Array.isArray(claim.body) || claim.body.length !== 1 || claim.body[0]?.claimed !== true || !claim.body[0]?.id) {
    throw new Error(`Scheduler claim failed with status ${claim.status}`);
  }

  const complete = await bridge({
    path: "/rpc/complete_scheduled_job",
    method: "POST",
    body: {
      p_job_id: claim.body[0].id,
      p_status: "completed",
      p_retryable: false,
      p_last_error_code: null,
      p_next_retry_at: null,
    },
  });
  if (complete.status !== 200 || !Array.isArray(complete.body) || complete.body.length !== 1 || complete.body[0]?.status !== "completed") {
    throw new Error(`Scheduler completion failed with status ${complete.status}`);
  }

  const deleteBlocked = await bridge({
    path: `/approval_requests?id=eq.${encodeURIComponent(approveId)}`,
    method: "DELETE",
  });
  if (deleteBlocked.status !== 403) throw new Error(`DELETE boundary returned ${deleteBlocked.status}`);

  console.log("WRITE_BRIDGE_LIVE_SMOKE", JSON.stringify({
    unauthorizedStatus: unauthorized.status,
    createdApprovalCount: createdIds.length,
    approvalReadStatus: approveRead.status,
    approved: true,
    rejected: true,
    auditWriteStatus: audit.status,
    schedulerClaimed: true,
    schedulerCompleted: true,
    deleteBlockedStatus: deleteBlocked.status,
  }));
}
