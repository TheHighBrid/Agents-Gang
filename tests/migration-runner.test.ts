import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildFreshBundle,
  buildUpgradeBundle,
  buildPsqlConnectionEnvironment,
  migrationBaselines,
} from "../scripts/db-migrate.mjs";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("production migration runner", () => {
  test("builds a fresh-install bundle from schema plus hardening and non-destructive verification", () => {
    const sql = buildFreshBundle(root);

    expect(sql).toContain("create table if not exists approval_requests");
    expect(sql).toContain("create table if not exists scheduled_jobs");
    expect(sql).toContain("create or replace function claim_scheduled_job");
    expect(sql).toContain("alter table scheduled_jobs enable row level security");
    expect(sql).toContain("Agents-Gang schema verification passed");
    expect(sql).toContain("Agents-Gang Supabase scheduler security verification passed");
    expect(sql).not.toContain("drop table if exists");
  });

  test("upgrades an explicit governed-execution baseline in lexical migration order", () => {
    const sql = buildUpgradeBundle(root, "20260815_governed_execution");

    const baselineGuard = sql.indexOf("Agents-Gang baseline 20260815_governed_execution verified");
    const approvalUpgrade = sql.indexOf("approval_requests_status_check");
    const schedulerUpgrade = sql.indexOf("create table if not exists scheduled_jobs");
    const schedulerHardening = sql.indexOf("alter table scheduled_jobs enable row level security");
    const finalVerify = sql.indexOf("Agents-Gang schema verification passed");
    const securityVerify = sql.indexOf("Agents-Gang Supabase scheduler security verification passed");

    expect(baselineGuard).toBeGreaterThanOrEqual(0);
    expect(approvalUpgrade).toBeGreaterThan(baselineGuard);
    expect(schedulerUpgrade).toBeGreaterThan(approvalUpgrade);
    expect(schedulerHardening).toBeGreaterThan(schedulerUpgrade);
    expect(finalVerify).toBeGreaterThan(schedulerHardening);
    expect(securityVerify).toBeGreaterThan(finalVerify);
    expect(sql).not.toContain("add column if not exists target_type");
    expect(sql).not.toContain("drop table if exists");
  });

  test("supports only named known baselines and refuses to guess", () => {
    expect(migrationBaselines).toEqual([
      "20260815_governed_execution",
      "20260817_approval_consumption",
      "20260818_scheduler_reliability",
      "20260819_supabase_scheduler_hardening",
    ]);
    expect(() => buildUpgradeBundle(root, "unknown-baseline")).toThrow(/Unknown migration baseline/);
  });

  test("converts DATABASE_URL into libpq environment without putting credentials in psql arguments", () => {
    const connection = buildPsqlConnectionEnvironment(
      "postgresql://melato_user:super-secret@db.example.test:6543/melato?sslmode=require",
    );

    expect(connection.env).toMatchObject({
      PGHOST: "db.example.test",
      PGPORT: "6543",
      PGDATABASE: "melato",
      PGUSER: "melato_user",
      PGPASSWORD: "super-secret",
      PGSSLMODE: "require",
    });
    expect(connection.args.join(" ")).not.toContain("super-secret");
    expect(connection.args.join(" ")).not.toContain("postgresql://");
  });

  test("verification SQL checks schema and scheduler security without mutation", () => {
    const verification = `${read("db/verify.sql")}\n${read("db/verify-supabase-security.sql")}`;

    for (const expected of [
      "approval_requests",
      "agent_runs",
      "routing_decisions",
      "tool_calls",
      "audit_events",
      "scheduled_jobs",
      "approval_requests_status_created_at_idx",
      "scheduled_jobs_status_retry_idx",
      "claim_scheduled_job",
      "complete_scheduled_job",
      "consumed",
      "relrowsecurity",
      "PUBLIC can execute scheduler RPCs",
      "service_role lacks scheduler persistence access",
    ]) {
      expect(verification).toContain(expected);
    }
    expect(verification).toContain("raise exception");
    expect(verification.toLowerCase()).not.toMatch(/^\s*(insert|update|delete|drop|alter|create)\b/im);
  });
});
