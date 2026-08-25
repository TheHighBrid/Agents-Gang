import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const bridge = readFileSync(
  join(root, "supabase/functions/agents-gang-persistence-bridge/index.ts"),
  "utf8",
);
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");

describe("deployable staging persistence bridge", () => {
  test("ships the function expected by the staging repository transport", () => {
    expect(bridge).toContain("Deno.serve");
    expect(config).toContain("[functions.agents-gang-persistence-bridge]");
    expect(config).toContain("verify_jwt = false");
  });

  test("verifies short-lived application sessions without duplicating the founder signing secret into Supabase", () => {
    expect(bridge).toContain("FOUNDER_VERIFIER_URL");
    expect(bridge).toContain("/api/founder/verify");
    expect(bridge).not.toContain('Deno.env.get("FOUNDER_AUTH_SECRET")');
    expect(bridge).not.toContain("SUPABASE_SECRET_KEYS");
    expect(bridge).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(bridge.indexOf("await sessionIsValid(")).toBeLessThan(
      bridge.indexOf("await fetch(`${supabaseUrl}/rest/v1${query.path}`"),
    );
  });

  test("limits transport to the governed operational tables and scheduler RPCs", () => {
    for (const table of [
      "agent_runs",
      "approval_requests",
      "audit_events",
      "routing_decisions",
      "scheduled_jobs",
      "tool_calls",
    ]) expect(bridge).toContain(`"${table}"`);

    expect(bridge).toContain('"claim_scheduled_job"');
    expect(bridge).toContain('"complete_scheduled_job"');
    expect(bridge).toContain('method: "GET" | "POST" | "PATCH"');
    expect(bridge).toContain("PATCH_TABLES");
    expect(bridge).toContain('method !== "GET" && method !== "POST" && method !== "PATCH"');
    expect(bridge).not.toContain('method === "DELETE"');
  });

  test("keeps approval decisions founder-only while operational jobs accept founder or operator scope", () => {
    expect(bridge).toContain('scope: "founder"');
    expect(bridge).toContain('scope: "operator"');
    expect(bridge).toContain('?role=operator');
    expect(bridge).toContain('table === "approval_requests"');
    expect(bridge).toContain('statusFilter === "eq.pending"');
    expect(bridge).toContain('statusFilter === "eq.approved"');
  });

  test("preserves safe dashboard projections while allowing founder approval detail fields", () => {
    expect(bridge).toContain('url.searchParams.set("select", projection)');
    expect(bridge).not.toContain('agent_runs: "*"');
    expect(bridge).not.toMatch(/"audit_events":\s*"[^"]*metadata/);
    expect(bridge).not.toMatch(/"routing_decisions":\s*"[^"]*reason/);
    expect(bridge).toContain("FOUNDER_APPROVAL_PROJECTION");
    expect(bridge).toContain("payload_summary");
    expect(bridge).toContain("result");
  });

  test("authenticates legacy JWT service-role requests without forwarding modern secret keys", () => {
    expect(bridge).toContain('!serviceRoleKey.startsWith("sb_secret_")');
    expect(bridge).toContain('headers.Authorization = `Bearer ${serviceRoleKey}`');
  });
});
