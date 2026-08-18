# Observability and Correlation Runbook

## Purpose

This contract makes a request or scheduled delivery traceable without copying protected payloads into logs, dashboard responses, or audit metadata.

The durable `agent_runs.id` remains the execution identity. A separate bounded `correlationId` connects an incoming API request or scheduled delivery to that durable run. The relationship is persisted as a `run.correlation` audit event whose metadata contains only the correlation identifier.

## Correlation contract

Accepted correlation identifiers contain only letters, numbers, `.`, `_`, `:`, or `-` and are 8 to 128 characters long. Unsafe or absent caller identifiers are replaced with a generated UUID.

For chat requests:

1. `POST /api/chat` resolves the request correlation identifier before request-body processing.
2. `runChat` persists the durable agent run.
3. A `run.correlation` audit event binds the correlation identifier to that run ID.
4. Routing decisions, tool calls, and normal audit events continue to use the durable run ID.
5. Structured logs contain the correlation identifier and, only when a durable run exists, the real persisted run ID.
6. The response returns the correlation identifier in the `x-correlation-id` header.

For scheduled jobs:

1. One correlation identifier is resolved for the scheduler delivery and retained across retry attempts.
2. Scheduler lifecycle audit events record the correlation identifier, stable job name, durable scheduled-job ID, and attempt count.
3. Every claimed attempt creates a governed agent run and a `run.correlation` audit anchor.
4. Tool audit events receive the same correlation identifier through `ToolExecutionContext`.
5. Duplicate or concurrency-limited deliveries remain traceable even when no new agent run is created.

The dashboard may expose only a validated `correlationId` joined from a `run.correlation` audit event. It must never expose arbitrary audit metadata.

## Operational metric window

The default health window is the most recent **15 minutes**.

| Metric | Alert threshold | Severity | First owner | First response |
|---|---:|---|---|---|
| Failed scheduled jobs | 1 | Critical | Manus | Inspect the failed job and correlation trail before retrying. |
| Provider timeouts | 3 | Warning | Manus | Check provider availability and use only governed scheduler retry policy. |
| Persistence timeouts | 1 | Critical | Manus | Verify persistence health before permitting additional mutating work. |
| Blocked tool actions | 3 | Warning | SOL 5.6 | Surface the repeated policy blocks and review the requested action path. |

These thresholds are deterministic policy, not adaptive heuristics. C4-04 may render them but must not silently change them in the UI.

## Payload-safety rules

Operational metrics and alerts may use only counts, safe error codes, timestamps, durable IDs, job names, agent names, and validated correlation identifiers.

Never include:

- request or email bodies
- Shopify/customer payloads
- provider responses
- prompts or memory content
- API keys, tokens, session secrets, or credential fragments
- arbitrary audit metadata in dashboard or alert output

`createStructuredLogger` deliberately discards its `payload` field before writing. `evaluateOperationalHealth` returns only metric counts and static operational guidance.

## First-response procedure

For a critical alert, first identify the correlation identifier and durable run/job IDs. Inspect the safe error code and lifecycle records before taking action. Do not retry a job if its persisted retry time has not arrived, its retry budget is exhausted, or its failure class is not retryable.

If execution persistence is unhealthy, treat that as a stop condition for high-risk or mutating operations. Restoring auditability and durable state takes precedence over forcing work through.

Repeated policy blocks are not a reason to lower risk classification or bypass approval. They indicate the requested workflow or operator guidance needs review.

## Escalation

- **Manus** owns scheduler, provider, persistence, and operational reliability triage.
- **SOL 5.6** owns founder-facing representation of repeated blocks and operational health in C4-04.
- **Codex/security review** is required when a proposed fix changes authorization, approval, policy enforcement, secret handling, or execution-boundary semantics.
- **Founder decision** is required before accepting any release exception that weakens a high-risk or production safety gate.

## C4-04 handoff contract

C4-04 may consume:

- `DashboardRun.correlationId`
- durable scheduled-job status and retry fields
- `OperationalHealthSnapshot.metrics`
- `OperationalHealthSnapshot.alerts`

C4-04 must preserve the safe DTO boundary and must not render raw audit metadata or provider payloads.
