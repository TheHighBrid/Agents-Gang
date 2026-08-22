import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "../app/api/dashboard/route";
import { createFounderSessionToken } from "../lib/approvals/auth";

const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalFounderSecret = process.env.FOUNDER_AUTH_SECRET;

function restore(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "FOUNDER_AUTH_SECRET", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  vi.restoreAllMocks();
  restore("SUPABASE_URL", originalUrl);
  restore("SUPABASE_SERVICE_ROLE_KEY", originalKey);
  restore("FOUNDER_AUTH_SECRET", originalFounderSecret);
});

describe("dashboard route persistence error boundary", () => {
  test("converts an asynchronous Supabase rejection into a JSON 500 response", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_synthetic-dashboard-test-key_12345678";
    process.env.FOUNDER_AUTH_SECRET = "synthetic-founder-auth-secret-value-at-least-32-characters";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 401 }));

    const now = Math.floor(Date.now() / 1000);
    const token = createFounderSessionToken({
      subject: "dashboard-route-test",
      role: "founder",
      sessionId: "dashboard-route-test-session",
      issuedAt: now,
      expiresAt: now + 60,
    }, process.env.FOUNDER_AUTH_SECRET);

    const response = await GET(new Request("https://example.test/api/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    }));

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Unable to load dashboard data" });
  });
});
