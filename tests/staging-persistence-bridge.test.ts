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

  test("verifies application founder sessions before using server-side credentials", () => {
    expect(bridge).toContain('claims.role === "founder"');
    expect(bridge).toContain('claims.expiresAt > Math.floor(Date.now() / 1000)');
    expect(bridge).toContain("revokedSessions.has(claims.sessionId)");
    expect(bridge.indexOf("await authorize(")).toBeLessThan(
      bridge.indexOf("await fetch(`${supabaseUrl}/rest/v1${query.path}`"),
    );
  });

  test("limits the privileged transport to allowlisted dashboard reads", () => {
    for (const table of [
      "agent_runs",
      "approval_requests",
      "audit_events",
      "routing_decisions",
      "scheduled_jobs",
      "tool_calls",
    ]) expect(bridge).toContain(`"${table}"`);

    expect(bridge).toContain('body.method !== "GET"');
    expect(bridge).toContain('method: "GET"');
    expect(bridge).toContain('url.searchParams.set("select", projection)');
    expect(bridge).not.toContain('agent_runs: "*"');
    expect(bridge).not.toMatch(/"audit_events":\s*"[^"]*metadata/);
    expect(bridge).not.toMatch(/"routing_decisions":\s*"[^"]*reason/);
    expect(bridge).not.toMatch(/"approval_requests":\s*"[^"]*(payload_summary|result)/);
  });

  test("authenticates legacy JWT service-role requests without forwarding modern secret keys", () => {
    expect(bridge).toContain('!serviceRoleKey.startsWith("sb_secret_")');
    expect(bridge).toContain('headers.Authorization = `Bearer ${serviceRoleKey}`');
  });
});
