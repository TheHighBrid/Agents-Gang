import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("scheduler reliability schema contract", () => {
  test("keeps fresh-install schema and forward migration aligned on scheduler RPCs", () => {
    const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../db/migrations/20260818_scheduler_reliability_up.sql", import.meta.url), "utf8");

    for (const source of [schema, migration]) {
      expect(source).toContain("create table if not exists scheduled_jobs");
      expect(source).toContain("create or replace function claim_scheduled_job");
      expect(source).toContain("create or replace function complete_scheduled_job");
    }
  });

  test("locks scheduler persistence to the server-side service role", () => {
    const migration = readFileSync(
      new URL("../db/migrations/20260819_supabase_scheduler_hardening_up.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("alter table scheduled_jobs enable row level security");
    expect(migration).toContain("revoke all on table scheduled_jobs from public");
    expect(migration).toContain("revoke execute on function claim_scheduled_job");
    expect(migration).toContain("revoke execute on function complete_scheduled_job");
    expect(migration).toContain("grant select, insert, update, delete on table scheduled_jobs to service_role");
    expect(migration).toContain("grant execute on function claim_scheduled_job");
    expect(migration).toContain("grant execute on function complete_scheduled_job");
  });

  test("fixes scheduler function search paths and locks the RLS event helper away from API roles", () => {
    const migration = readFileSync(
      new URL("../db/migrations/20260819_supabase_function_hardening_up.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain(
      "alter function claim_scheduled_job(text, text, text, integer, integer) set search_path = public",
    );
    expect(migration).toContain(
      "alter function complete_scheduled_job(uuid, text, boolean, text, timestamptz) set search_path = public",
    );
    expect(migration).toContain("revoke execute on function public.rls_auto_enable() from public");
    expect(migration).toContain("revoke execute on function public.rls_auto_enable() from anon");
    expect(migration).toContain("revoke execute on function public.rls_auto_enable() from authenticated");
  });

  test("uses an unambiguous scheduler conflict target and executes RPC smoke coverage", () => {
    const migration = readFileSync(
      new URL("../db/migrations/20260819_scheduler_rpc_runtime_fix_up.sql", import.meta.url),
      "utf8",
    );
    const smoke = readFileSync(new URL("../db/smoke-scheduler.sql", import.meta.url), "utf8");

    expect(migration).toContain("on conflict on constraint scheduled_jobs_idempotency_key_key do update");
    expect(migration).toContain("set search_path = public");
    expect(smoke).toContain("claim_scheduled_job");
    expect(smoke).toContain("complete_scheduled_job");
    expect(smoke).toContain("rollback;");
  });

  test("provides rollback migrations for scheduler reliability and hardening", () => {
    const schedulerRollback = readFileSync(
      new URL("../db/migrations/20260818_scheduler_reliability_down.sql", import.meta.url),
      "utf8",
    );
    const hardeningRollback = readFileSync(
      new URL("../db/migrations/20260819_supabase_scheduler_hardening_down.sql", import.meta.url),
      "utf8",
    );

    expect(schedulerRollback).toContain("drop function if exists complete_scheduled_job");
    expect(schedulerRollback).toContain("drop function if exists claim_scheduled_job");
    expect(schedulerRollback).toContain("drop table if exists scheduled_jobs");
    expect(hardeningRollback).toContain("alter table scheduled_jobs disable row level security");
  });
});
