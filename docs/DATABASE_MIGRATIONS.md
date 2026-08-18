# Database Migration and Verification Runbook

## Purpose

This runbook defines the controlled database deployment path for Agents-Gang. Database changes must be reproducible, verified against PostgreSQL catalog state, and must never guess which migrations a deployment has already received.

The migration runner is `scripts/db-migrate.mjs`. It has two execution styles:

- `bundle`: produce the exact SQL that would run. This is used by CI rehearsal and may be inspected before execution.
- `apply`: execute that exact bundle through `psql` using stdin and fail on the first SQL error.

No application runtime dependency is added for migrations. Production migration execution requires a compatible `psql` client installed in the operator/deployment environment.

## Connection safety

`apply` accepts either:

- `DATABASE_URL`, or
- libpq environment variables such as `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, and `PGSSLMODE`.

When `DATABASE_URL` is supplied, the runner parses it and passes credentials to `psql` through environment variables. The URL/password is not placed in process arguments.

Do not print database connection values into CI logs, issue comments, screenshots, or release evidence.

## Fresh installation

For a new empty database:

```bash
npm run db:migration:bundle -- fresh > /tmp/agents-gang-fresh.sql
npm run db:migrate -- fresh
```

The bundle applies `db/schema.sql` and then `db/verify.sql`. Verification is read-only and fails if required tables, columns, indexes, constraints, or scheduler functions are missing.

A fresh deployment is not accepted merely because SQL execution exits zero. The final catalog verification must also pass.

## Existing deployment upgrade

Upgrade mode requires an explicit baseline:

```bash
npm run db:migrate -- upgrade --from 20260815_governed_execution
```

Supported baselines:

- `20260815_governed_execution`
- `20260817_approval_consumption`
- `20260818_scheduler_reliability`

The runner first checks the live catalog against the named baseline. If the database already contains later objects, or required baseline objects are missing, execution stops before forward migrations begin.

This is deliberate. The runner does not infer a baseline from filenames, timestamps, or partial object presence.

### Upgrade from `20260815_governed_execution`

The runner verifies that governed execution tables exist, that `scheduled_jobs` does not exist, and that the approval status constraint does not yet contain `consumed`. It then applies, in order:

1. `20260817_approval_consumption_up.sql`
2. `20260818_scheduler_reliability_up.sql`
3. `db/verify.sql`

### Upgrade from `20260817_approval_consumption`

The runner verifies the `consumed` approval status exists and `scheduled_jobs` does not yet exist, then applies the scheduler migration and verification.

### Baseline `20260818_scheduler_reliability`

No forward migration is currently required. The runner verifies the scheduler baseline and then executes the current full schema verification contract.

## Verification only

To check a database without changing it:

```bash
npm run db:verify
```

`db/verify.sql` performs catalog reads only. It checks the governed execution tables, key approval columns, required indexes, scheduler RPC signatures, and the approval lifecycle constraint.

A verification failure is a deployment stop condition. Do not repair a production schema by manually issuing guessed DDL. Determine the actual baseline and run the appropriate reviewed migration path.

## CI rehearsal

`.github/workflows/migration-rehearsal.yml` creates disposable PostgreSQL 16 databases and proves two paths independently:

1. Fresh `db/schema.sql` installation plus verification.
2. Upgrade from the committed `20260815_governed_execution` fixture through all later forward migrations plus verification.

The upgrade rehearsal also inserts a retained approval record before migration and confirms it remains present afterward. It then intentionally attempts the wrong older baseline against the upgraded database and requires that attempt to fail with `Baseline mismatch`.

This workflow contains no production credentials and performs no external production mutation.

## Failure handling

`psql` runs with `ON_ERROR_STOP=on`. A failing SQL statement stops the bundle and returns a non-zero process status.

The approval-consumption forward migration is explicitly transactional. The scheduler migration is explicitly transactional. Do not remove those transaction boundaries without a persistence review.

If a migration fails:

1. Stop deployment promotion.
2. Preserve the error output without copying secrets or protected data.
3. Run verification only if the failed transaction has fully rolled back and doing so is safe.
4. Inspect the live baseline and the failed migration before retrying.
5. Do not edit production catalog objects manually to make the verifier green.

## Rollback policy

Database down migrations are **not** the normal application rollback mechanism. Several existing down migrations are destructive or semantically lossy.

### `20260818_scheduler_reliability_down.sql`

This removes scheduler RPCs and the `scheduled_jobs` table. Running it destroys durable scheduler history, retry state, idempotency records, and lease state. Treat it as destructive.

### `20260817_approval_consumption_down.sql`

This converts every `consumed` approval to `expired` before removing `consumed` from the allowed status set. The distinction between a consumed approval and an expired approval is lost. Treat it as semantically destructive.

### `20260815_governed_execution_down.sql`

This removes run, routing, tool-call, and audit tables and removes governed approval columns. It destroys operational/audit history. Treat it as highly destructive.

## Preferred application rollback

When a release must be rolled back, prefer this order:

1. Disable or stop new high-risk/mutating work.
2. Keep the forward database schema in place if the previous application version is verified compatible with it.
3. Roll the application artifact back.
4. Verify protected reads, approval behavior, and scheduler health.
5. Use a database down migration only when a reviewed recovery plan explicitly accepts its data-loss consequences and a restorable backup exists.

Do not assume an older application can safely interpret newer approval lifecycle states. Compatibility must be checked before application rollback across the approval-consumption boundary.

## Production preconditions

Before running `apply` against production:

- the exact commit/release candidate must have green repository quality and migration-rehearsal workflows;
- the operator must know the current database baseline;
- a restorable database backup or provider recovery point must exist for any migration with destructive rollback consequences;
- high-risk mutations must be disabled or otherwise controlled during schema intervention if consistency could be affected;
- the final `db/verify.sql` result must be retained in release evidence without secrets.

C5-01 provides the migration and verification mechanism. C5-02 owns environment/secret validation, C5-03 owns enforced release gates and supply-chain policy, and C5-06 owns the actual founder-authorized production deployment.
