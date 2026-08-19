#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDirectory, "..");

export const migrationBaselines = Object.freeze([
  "20260815_governed_execution",
  "20260817_approval_consumption",
  "20260818_scheduler_reliability",
  "20260819_supabase_scheduler_hardening",
  "20260819_supabase_function_hardening",
  "20260819_scheduler_rpc_runtime_fix",
]);

const forwardMigrations = Object.freeze([
  "20260815_governed_execution",
  "20260817_approval_consumption",
  "20260818_scheduler_reliability",
  "20260819_supabase_scheduler_hardening",
  "20260819_supabase_function_hardening",
  "20260819_scheduler_rpc_runtime_fix",
]);

function read(root, path) {
  return readFileSync(join(root, path), "utf8");
}

function section(label, sql) {
  return `\n-- Agents-Gang migration section: ${label}\n${sql.trim()}\n`;
}

function securityVerification(root) {
  return section("Supabase security verification", read(root, "db/verify-supabase-security.sql"));
}

function schedulerSmoke(root) {
  return section("scheduler RPC smoke", read(root, "db/smoke-scheduler.sql"));
}

export function buildFreshBundle(root = defaultRoot) {
  return [
    "\\set ON_ERROR_STOP on\n",
    section("fresh schema", read(root, "db/schema.sql")),
    section(
      "forward 20260819_supabase_scheduler_hardening",
      read(root, "db/migrations/20260819_supabase_scheduler_hardening_up.sql"),
    ),
    section(
      "forward 20260819_supabase_function_hardening",
      read(root, "db/migrations/20260819_supabase_function_hardening_up.sql"),
    ),
    section(
      "forward 20260819_scheduler_rpc_runtime_fix",
      read(root, "db/migrations/20260819_scheduler_rpc_runtime_fix_up.sql"),
    ),
    section("final verification", read(root, "db/verify.sql")),
    securityVerification(root),
    schedulerSmoke(root),
  ].join("");
}

export function buildUpgradeBundle(root = defaultRoot, baseline) {
  assertKnownBaseline(baseline);
  const baselineIndex = forwardMigrations.indexOf(baseline);
  const laterMigrations = forwardMigrations.slice(baselineIndex + 1);

  return [
    "\\set ON_ERROR_STOP on\n",
    section(`baseline guard ${baseline}`, baselineGuardSql(baseline)),
    ...laterMigrations.map((migration) => section(
      `forward ${migration}`,
      read(root, `db/migrations/${migration}_up.sql`),
    )),
    section("final verification", read(root, "db/verify.sql")),
    securityVerification(root),
    schedulerSmoke(root),
  ].join("");
}

export function buildVerificationBundle(root = defaultRoot) {
  return [
    "\\set ON_ERROR_STOP on\n",
    section("verification only", read(root, "db/verify.sql")),
    securityVerification(root),
  ].join("");
}

export function buildPsqlConnectionEnvironment(databaseUrl, baseEnvironment = process.env) {
  if (typeof databaseUrl !== "string" || !databaseUrl.trim()) {
    throw new Error("DATABASE_URL is required when PostgreSQL connection variables are not supplied");
  }

  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql scheme");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !database || !url.username) {
    throw new Error("DATABASE_URL must include host, database, and user");
  }

  const env = {
    ...baseEnvironment,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: database,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") || "require",
  };
  delete env.DATABASE_URL;

  return {
    env,
    args: ["-X", "--no-psqlrc", "--set=ON_ERROR_STOP=on", "--file=-"],
  };
}

function connectionFromEnvironment(environment = process.env) {
  if (environment.DATABASE_URL?.trim()) {
    return buildPsqlConnectionEnvironment(environment.DATABASE_URL, environment);
  }
  const required = ["PGHOST", "PGDATABASE", "PGUSER"];
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length) {
    throw new Error(`PostgreSQL connection is not configured; missing ${missing.join(", ")} or DATABASE_URL`);
  }
  return {
    env: { ...environment },
    args: ["-X", "--no-psqlrc", "--set=ON_ERROR_STOP=on", "--file=-"],
  };
}

export function applySql(sql, { environment = process.env, command = "psql" } = {}) {
  const connection = connectionFromEnvironment(environment);
  const result = spawnSync(command, connection.args, {
    env: connection.env,
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(`${command} is required for database migration execution but was not found`);
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Database migration command failed with exit code ${result.status ?? "unknown"}`);
  }
}

function baselineGuardSql(baseline) {
  if (baseline === "20260815_governed_execution") {
    return `do $$\nbegin\n  if to_regclass('public.approval_requests') is null\n    or to_regclass('public.agent_runs') is null\n    or to_regclass('public.routing_decisions') is null\n    or to_regclass('public.tool_calls') is null\n    or to_regclass('public.audit_events') is null then\n    raise exception 'Baseline mismatch: 20260815 governed execution objects are incomplete';\n  end if;\n  if to_regclass('public.scheduled_jobs') is not null then\n    raise exception 'Baseline mismatch: scheduled_jobs already exists; choose a later baseline';\n  end if;\n  if exists (\n    select 1 from pg_constraint c\n    where c.conrelid = 'public.approval_requests'::regclass\n      and c.contype = 'c'\n      and pg_get_constraintdef(c.oid) like '%consumed%'\n  ) then\n    raise exception 'Baseline mismatch: consumed approval status already exists; choose a later baseline';\n  end if;\n  raise notice 'Agents-Gang baseline 20260815_governed_execution verified';\nend $$;`;
  }

  if (baseline === "20260817_approval_consumption") {
    return `do $$\nbegin\n  if to_regclass('public.approval_requests') is null\n    or to_regclass('public.agent_runs') is null\n    or to_regclass('public.routing_decisions') is null\n    or to_regclass('public.tool_calls') is null\n    or to_regclass('public.audit_events') is null then\n    raise exception 'Baseline mismatch: governed execution objects are incomplete';\n  end if;\n  if not exists (\n    select 1 from pg_constraint c\n    where c.conrelid = 'public.approval_requests'::regclass\n      and c.contype = 'c'\n      and pg_get_constraintdef(c.oid) like '%consumed%'\n  ) then\n    raise exception 'Baseline mismatch: consumed approval status is missing';\n  end if;\n  if to_regclass('public.scheduled_jobs') is not null then\n    raise exception 'Baseline mismatch: scheduled_jobs already exists; choose a later baseline';\n  end if;\n  raise notice 'Agents-Gang baseline 20260817_approval_consumption verified';\nend $$;`;
  }

  if (baseline === "20260818_scheduler_reliability") {
    return `do $$\nbegin\n  if to_regclass('public.scheduled_jobs') is null\n    or to_regprocedure('public.claim_scheduled_job(text,text,text,integer,integer)') is null\n    or to_regprocedure('public.complete_scheduled_job(uuid,text,boolean,text,timestamp with time zone)') is null then\n    raise exception 'Baseline mismatch: scheduler reliability objects are incomplete';\n  end if;\n  raise notice 'Agents-Gang baseline 20260818_scheduler_reliability verified';\nend $$;`;
  }

  if (baseline === "20260819_supabase_scheduler_hardening") {
    return `do $$\nbegin\n  if to_regclass('public.scheduled_jobs') is null\n    or to_regprocedure('public.claim_scheduled_job(text,text,text,integer,integer)') is null\n    or to_regprocedure('public.complete_scheduled_job(uuid,text,boolean,text,timestamp with time zone)') is null then\n    raise exception 'Baseline mismatch: scheduler hardening objects are incomplete';\n  end if;\n  if not exists (\n    select 1 from pg_class\n    where oid = 'public.scheduled_jobs'::regclass\n      and relrowsecurity\n  ) then\n    raise exception 'Baseline mismatch: scheduler hardening RLS is missing';\n  end if;\n  raise notice 'Agents-Gang baseline 20260819_supabase_scheduler_hardening verified';\nend $$;`;
  }

  if (baseline === "20260819_supabase_function_hardening") {
    return `do $$\nbegin\n  if to_regclass('public.scheduled_jobs') is null\n    or to_regprocedure('public.claim_scheduled_job(text,text,text,integer,integer)') is null\n    or to_regprocedure('public.complete_scheduled_job(uuid,text,boolean,text,timestamp with time zone)') is null then\n    raise exception 'Baseline mismatch: Supabase function hardening objects are incomplete';\n  end if;\n  if not exists (\n    select 1 from pg_proc\n    where oid = 'public.claim_scheduled_job(text,text,text,integer,integer)'::regprocedure\n      and proconfig @> array['search_path=public']\n  ) or not exists (\n    select 1 from pg_proc\n    where oid = 'public.complete_scheduled_job(uuid,text,boolean,text,timestamp with time zone)'::regprocedure\n      and proconfig @> array['search_path=public']\n  ) then\n    raise exception 'Baseline mismatch: Supabase function search_path hardening is missing';\n  end if;\n  raise notice 'Agents-Gang baseline 20260819_supabase_function_hardening verified';\nend $$;`;
  }

  return `do $$\nbegin\n  if to_regclass('public.scheduled_jobs') is null\n    or to_regprocedure('public.claim_scheduled_job(text,text,text,integer,integer)') is null then\n    raise exception 'Baseline mismatch: scheduler RPC runtime fix objects are incomplete';\n  end if;\n  if pg_get_functiondef('public.claim_scheduled_job(text,text,text,integer,integer)'::regprocedure)\n      not ilike '%on conflict on constraint scheduled_jobs_idempotency_key_key do update%' then\n    raise exception 'Baseline mismatch: scheduler RPC runtime conflict fix is missing';\n  end if;\n  raise notice 'Agents-Gang baseline 20260819_scheduler_rpc_runtime_fix verified';\nend $$;`;
}

function assertKnownBaseline(baseline) {
  if (!migrationBaselines.includes(baseline)) {
    throw new Error(`Unknown migration baseline: ${baseline}. Expected one of: ${migrationBaselines.join(", ")}`);
  }
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/db-migrate.mjs bundle fresh",
    "  node scripts/db-migrate.mjs bundle upgrade --from <baseline>",
    "  node scripts/db-migrate.mjs bundle verify",
    "  node scripts/db-migrate.mjs apply fresh",
    "  node scripts/db-migrate.mjs apply upgrade --from <baseline>",
    "  node scripts/db-migrate.mjs apply verify",
    "",
    `Known upgrade baselines: ${migrationBaselines.join(", ")}`,
    "",
    "apply requires psql plus DATABASE_URL or PGHOST/PGDATABASE/PGUSER connection variables.",
  ].join("\n");
}

function bundleFor(args) {
  const mode = args[1];
  if (mode === "fresh") return buildFreshBundle(defaultRoot);
  if (mode === "verify") return buildVerificationBundle(defaultRoot);
  if (mode === "upgrade") {
    const baseline = argumentValue(args, "--from");
    if (!baseline) throw new Error("upgrade requires --from <known-baseline>");
    return buildUpgradeBundle(defaultRoot, baseline);
  }
  throw new Error(`Unknown migration mode: ${mode ?? "missing"}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const command = args[0];
    if (command !== "bundle" && command !== "apply") {
      throw new Error(usage());
    }
    const sql = bundleFor(args);
    if (command === "bundle") process.stdout.write(sql);
    else applySql(sql);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Database migration failed");
    process.exitCode = 1;
  }
}
