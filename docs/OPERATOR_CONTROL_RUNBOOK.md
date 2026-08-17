# Protected Manual Job Control Runbook

## Scope

`POST /api/jobs` is the server-side control plane for narrowly eligible manual scheduler actions. The initial eligible registry contains **`daily-melato-audit` only**. Other jobs remain unavailable until their production adapters and operator safety contracts are reviewed.

The endpoint preserves the shared scheduler’s idempotency, distributed lease, durable run, routing, tool-call, and audit-event behavior. It does not expose direct adapter execution.

## Authorization

Manual controls fail closed unless `OPERATOR_CONTROL_TOKEN` is configured on the server. An operator request must include all of the following:

| Requirement | Value |
|---|---|
| Credential | `Authorization: Bearer <server-configured token>` |
| Role | `X-Operator-Role: operator` |
| Optional operator identifier | `X-Operator-ID` with a safe identifier; otherwise `operator` is recorded |
| Correlation | Optional `X-Correlation-ID`; otherwise the API generates one and returns it in the response header and body |

The endpoint never returns the configured token, protected request body, adapter credentials, raw tool payloads, prompts, or external response bodies.

## Request contract

A trigger request supplies `action: "trigger"`, an eligible `jobName`, and a safe `idempotencyKey`. The API returns `202` for an accepted execution and `200` when a duplicate key is safely suppressed.

A retry request supplies `action: "retry"`, an eligible `jobName`, `failedRunId`, and a caller request idempotency token. Retries are permitted only when the source run is failed with `scheduled_job_retryable`. The controller scopes the stored retry key to the source run as `retry:<failedRunId>:<caller-key>`.

## Safety controls

| Condition | Response | Audit behavior |
|---|---|---|
| Missing role or invalid credential | `403 unauthorized_operator` | Payload-safe structured rejection log |
| Operator control token absent | `503 operator_controls_not_configured` | Payload-safe structured rejection log |
| Malformed request or key | `400 invalid_request` or `invalid_idempotency_key` | Safe API error; no job runs |
| Job not eligible | `404 invalid_job` | Durable `operator_control.invalid_job` audit event |
| Duplicate request | `200` with `duplicate: true` | Durable `operator_control.duplicate` audit event |
| Non-retryable run | `409 retry_not_eligible` | Durable `operator_control.retry_ineligible` audit event |
| Retry budget exhausted | `409 retry_exhausted` | Durable `operator_control.retry_exhausted` audit event |

The in-process control guard suppresses concurrent duplicate keys before local job execution. The scheduled-job runner provides the durable cross-worker backstop through idempotency lookup and distributed leases.

## Operator procedure

1. Confirm the job is on the eligible list and the action is operationally necessary.
2. Use a new safe idempotency key for a new trigger. Reuse the same key only to recover a response after a client-side delivery failure.
3. For a retry, verify the failed run is marked `scheduled_job_retryable`; do not retry permanent failures.
4. Investigate by correlation ID in the persisted dashboard and structured logs. Do not copy raw payloads into incident notes.
5. Treat `retry_exhausted`, repeated blocks, provider timeouts, and persistence alerts as an investigation signal rather than a reason to bypass controls.
