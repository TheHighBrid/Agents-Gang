# Durable Scheduler Reliability Contract

## Scope and operating boundary

C4-01 introduces a **database-backed job reliability layer** for governed scheduled work. It does not create public trigger or retry endpoints; those controls are intentionally deferred to C4-02. A trusted scheduler or queue consumer must invoke `runReliableScheduledJob` with a deterministic idempotency key for each intended schedule window or event delivery.

The persistence boundary is Supabase/Postgres. `scheduled_jobs` stores the durable lifecycle record, while each claimed attempt is executed through the existing `runGovernedJob` lifecycle and therefore produces the corresponding agent-run, routing-decision, tool-call, and audit records.

## Scheduler record contract

| Field | Purpose |
|---|---|
| `job_name` | Stable identifier for the scheduled workflow. |
| `idempotency_key` | Unique delivery identity. Replayed completed deliveries do not execute again. |
| `attempt_count` / `max_attempts` | Bounded retry accounting. The implementation permits 1–10 attempts. |
| `status` | `running`, `retry_scheduled`, `completed`, or `failed`. |
| `lease_expires_at` | Prevents concurrent workers from executing the same delivery; an expired lease may be recovered. |
| `retryable`, `last_error_code`, `next_retry_at` | Safe failure classification and retry scheduling state. |

`claim_scheduled_job` is an atomic Postgres RPC. It inserts an unseen idempotency key, returns a `duplicate` record for a repeated delivery, returns `concurrency_limited` when another delivery of the same job holds an unexpired lease, claims a due retry, or recovers an expired lease only while attempts remain. `complete_scheduled_job` performs a compare-and-set update that succeeds only from `running`, preventing a late worker from overwriting a newer state.

## Retry policy

The runner defaults to three total attempts, a 300-second lease, and a 1-second local retry delay. Tests may provide a zero-delay callback; production callers should use a non-zero delay or an external queue that redelivers at `next_retry_at`.

A failure is retryable only when it explicitly exposes a safe string `code` and `retriable: true`, such as normalized provider rate-limit or timeout failures. Unclassified failures and explicitly non-retryable failures become terminal `failed` records. The final record retains the last safe failure code after eventual recovery so operators can see that a retry occurred without storing raw provider data.

## Deployment and operational requirements

Apply `db/migrations/20260818_scheduler_reliability_up.sql` to existing environments. Fresh environments receive the same table and RPCs through `db/schema.sql`. `db/migrations/20260818_scheduler_reliability_down.sql` reverses the scheduler schema boundary; do not run it while retained scheduler history is required.

Before enabling real recurring jobs, configure the chosen trusted scheduler to derive stable idempotency keys, such as `<job-name>:<UTC schedule window>`. Never derive a key from raw email content, provider credentials, or protected payloads. Trigger authentication, manual retries, scheduler health telemetry, and operator controls remain C4-02 through C4-04 work.
