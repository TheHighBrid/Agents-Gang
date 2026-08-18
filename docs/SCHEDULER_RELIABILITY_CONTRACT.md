# Durable Scheduler Reliability Contract

## Production selection

C4-01 selects **Supabase/Postgres as the production reliability and coordination adapter** for scheduled work. It owns durable lifecycle state, idempotency, leases, concurrency control, retry timing, and terminal outcomes.

The external clock/delivery mechanism is deliberately replaceable. The project plan permits Vercel, Railway, cron, Inngest, or Trigger.dev style delivery, and the repository does not yet lock deployment to one host. Any trusted delivery mechanism may invoke `runReliableScheduledJob` as long as it supplies the same deterministic delivery identity. Reliability correctness must not depend on an in-process timer or on a specific hosting vendor.

C4-01 does not expose public trigger or retry endpoints. Authenticated operator controls belong to C4-02.

## Scope and operating boundary

A trusted scheduler or queue consumer invokes `runReliableScheduledJob` with a deterministic idempotency key for each intended schedule window or event delivery. The persistence boundary is Supabase/Postgres. `scheduled_jobs` stores the durable lifecycle record, while each claimed execution attempt uses the existing `runGovernedJob` lifecycle and therefore produces corresponding agent-run, routing-decision, tool-call, and audit records.

## Scheduler record contract

| Field | Purpose |
|---|---|
| `job_name` | Stable identifier for the scheduled workflow. |
| `idempotency_key` | Unique delivery identity. Replayed terminal deliveries do not execute again. |
| `attempt_count` / `max_attempts` | Bounded retry accounting. The implementation permits 1–10 attempts. |
| `status` | `running`, `retry_scheduled`, `completed`, or `failed`. |
| `lease_expires_at` | Prevents concurrent workers from executing the same delivery; an expired lease may be recovered. |
| `retryable`, `last_error_code`, `next_retry_at` | Safe failure classification and retry scheduling state. |

`claim_scheduled_job` is an atomic Postgres RPC. It inserts an unseen idempotency key, returns a `duplicate` record for a repeated delivery, returns `concurrency_limited` when another delivery of the same job holds an unexpired lease, claims a due retry, or recovers an expired lease only while attempts remain. `complete_scheduled_job` performs a compare-and-set update that succeeds only from `running`, preventing a late worker from overwriting a newer state.

## Retry policy

The runner defaults to three total attempts, a 300-second lease, and a 1-second local retry delay. Production delivery may instead redeliver externally at the persisted `next_retry_at` time.

A retry-scheduled record is not claimable before its persisted due time. At or after `next_retry_at`, the same idempotency key may be claimed for the next bounded attempt. A failure is retryable only when it explicitly exposes a safe string `code` and `retriable: true`, such as a normalized provider rate-limit or timeout failure. Unclassified failures and explicitly non-retryable failures become terminal `failed` records. The final record retains the last safe failure code after eventual recovery so operators can see that a retry occurred without storing raw provider data.

## Cancellation policy

Cancellation is intentionally limited to a delivery that has been **claimed but has not started its governed external execution**. `cancelClaimedScheduledJob` completes that running scheduler record as terminal `failed`, sets `retryable` to false, and records the stable code `scheduled_job_cancelled`. Replaying the same idempotency key then returns `duplicate` and cannot execute the delivery.

This contract does not claim that the system can abort an external side effect already in flight. Once governed execution has started, cancellation must not be represented as a successful abort unless the underlying provider exposes and verifies such a capability. Operator-triggered cancellation and retry controls remain C4-02 work.

## Idempotency and delivery identity

Production callers must derive stable keys such as `<job-name>:<UTC schedule window>` or another deterministic event identity. Never derive keys from raw email content, provider credentials, protected payloads, or non-deterministic process-local state.

Duplicate delivery, process restart, transport retry, and scheduler-provider replacement therefore converge on the same Postgres record instead of creating a second external execution path.

## Deployment and operational requirements

Apply `db/migrations/20260818_scheduler_reliability_up.sql` to existing environments. Fresh environments receive the same table and RPCs through `db/schema.sql`. `db/migrations/20260818_scheduler_reliability_down.sql` reverses the scheduler schema boundary; do not run it while retained scheduler history is required.

Safe recovery sequence:

1. Inspect the durable scheduler record and its safe failure code.
2. Do not manually replay a terminal idempotency key.
3. For `retry_scheduled`, wait until `next_retry_at`; early delivery remains a duplicate block.
4. For an expired `running` lease, allow the normal claim contract to recover it only while attempts remain.
5. Never bypass `runReliableScheduledJob` or the governed execution contract to force an external mutation.
6. Use C4-02 operator controls once they are accepted rather than direct database mutation.

Trigger authentication, manual retry/trigger controls, correlation telemetry, health alerts, and founder dashboard job-health presentation remain C4-02 through C4-04 work.
