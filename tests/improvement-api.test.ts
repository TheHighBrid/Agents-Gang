import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, POST } from "../app/api/improvement/route";
import { createFounderSessionToken } from "../lib/approvals/auth";
import { ImprovementStore } from "../lib/improvement/kernel.mjs";
let root: string;
const secret = "fixture-learning-authentication-secret";
function request(body?: unknown, role: "founder" | "operator" | "viewer" = "founder", sessionId = "learning-session") {
  const now = Math.floor(Date.now() / 1000);
  const token = createFounderSessionToken({ subject: "founder", role, sessionId, issuedAt: now - 1, expiresAt: now + 600 }, secret);
  return new Request("https://example.test/api/improvement", { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "learning-api-"));
  vi.stubEnv("FOUNDER_AUTH_SECRET", secret); vi.stubEnv("SELF_IMPROVEMENT_ENABLED", "true"); vi.stubEnv("SELF_IMPROVEMENT_DIR", root);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { force: true, recursive: true }); });

describe("trusted learning control plane", () => {
  test("denies unsigned, operator, viewer, expired and revoked requests", async () => {
    expect((await GET(new Request("https://example.test"))).status).toBe(401);
    for (const role of ["operator", "viewer"] as const) expect((await POST(request({ action: "resume" }, role))).status).toBe(403);
    vi.stubEnv("FOUNDER_REVOKED_SESSION_IDS", "learning-session");
    expect((await POST(request({ action: "resume" }))).status).toBe(401);
    vi.stubEnv("FOUNDER_REVOKED_SESSION_IDS", "");
    const expired = createFounderSessionToken({ subject: "founder", role: "founder", sessionId: "expired", issuedAt: 1, expiresAt: 2 }, secret);
    expect((await POST(new Request("https://example.test", { method: "POST", headers: { authorization: `Bearer ${expired}` }, body: '{}' }))).status).toBe(401);
  });
  test("founder feedback labels an existing attempt once and can pause/resume", async () => {
    const s = new ImprovementStore(root);
    const attempt = await s.record({ category: "finance", version: "baseline", suggestedAgent: "career_agent", selectedAgent: "career_agent", durationMs: 1, providerCalls: 2, status: "completed" });
    const body = { action: "feedback", attemptId: attempt.id, expectedAgent: "finance_agent" };
    expect((await POST(request(body))).status).toBe(200);
    expect((await POST(request(body))).status).toBe(409);
    expect((await POST(request({ action: "pause" }))).status).toBe(200);
    expect((await GET(request())).headers.get("Cache-Control")).toBe("no-store");
    expect((await s.read()).paused).toBe(true);
    await POST(request({ action: "resume" })); expect((await s.read()).paused).toBe(false);
  });
  test("rejects policy editing, arbitrary training records and disabled storage", async () => {
    expect((await POST(request({ action: "configure", approvalRequired: false }))).status).toBe(400);
    expect((await POST(request({ action: "feedback", attemptId: "fake", expectedAgent: "finance_agent" }))).status).toBe(409);
    vi.stubEnv("SELF_IMPROVEMENT_ENABLED", "false");
    expect((await GET(request())).status).toBe(503);
  });
});
