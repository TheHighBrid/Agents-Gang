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
    const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../db/migrations/20260818_scheduler_reliability_up.sql", import.meta.url), "utf8");

    for (const source of [schema, migration]) {
      expect(source).toContain("alter table scheduled_jobs enable row level security");
      expect(source).toContain("revoke all on table scheduled_jobs from public");
      expect(source).toContain("revoke execute on function claim_scheduled_job");
      expect(source).toContain("revoke execute on function complete_scheduled_job");
      expect(source).toContain("grant select, insert, update, delete on table scheduled_jobs to service_role");
      expect(source).toContain("grant execute on function claim_scheduled_job");
      expect(source).toContain("grant execute on function complete_scheduled_job");
    }
  });

  test("provides a rollback migration for the scheduler database boundary", () => {
    const rollback = readFileSync(new URL("../db/migrations/20260818_scheduler_reliability_down.sql", import.meta.url), "utf8");

    expect(rollback).toContain("drop function if exists complete_scheduled_job");
    expect(rollback).toContain("drop function if exists claim_scheduled_job");
    expect(rollback).toContain("drop table if exists scheduled_jobs");
  });
});
