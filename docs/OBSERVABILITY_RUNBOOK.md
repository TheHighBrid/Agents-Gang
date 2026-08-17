# Observability and Recovery Runbook

## Scope

The operational health summary is derived from persisted execution records and exposes **counts, error classes, alert state, and correlation identifiers only**. It does not expose raw user messages, tool payloads, credentials, prompts, or response bodies.

## Metrics and thresholds

| Alert key | Source metric | Warning | Critical | Owner | First response |
|---|---:|---:|---:|---|---|
| `failed_jobs` | Failed agent runs | 3 | 5 | Operations | Review the affected correlation IDs and determine whether the failures share a scheduler, provider, or policy cause. |
| `provider_timeouts` | Tool calls with `provider_timeout` | 3 | 5 | Integrations | Check provider status, rate-limit state, and retryability before changing schedules or credentials. |
| `persistence_timeouts` | Tool calls with `execution_persistence_timeout` | 2 | 3 | Platform | Verify Supabase availability, database latency, migration state, and service-role configuration. |
| `repeated_blocks` | Audit events with `outcome: blocked` | 5 | 10 | Governance | Review the policy or approval path. Do not bypass approval gates to silence the alert. |

Thresholds are evaluated over the persisted records returned by the dashboard data boundary. The dashboard is intentionally a recent operational snapshot rather than a replacement for a time-series monitoring service.

## Correlation and safe investigation

Every request may supply `X-Correlation-ID`; otherwise the API generates a safe identifier. The identifier is returned in the response header and body and is persisted across chat runs, routing decisions, tool calls, audit events, and scheduled-job lifecycle records. Operators should begin investigation by filtering safe logs and persisted records by this ID.

> Never add raw request content, external response bodies, access tokens, prompts, or approval payloads to logs, alert annotations, or incident tickets.

## Response procedure

| Severity | Expected response | Escalation |
|---|---|---|
| Warning | Acknowledge, identify the affected correlation IDs, and validate whether retries are safe under the execution contract. | Escalate to the alert owner if the threshold persists after the next operational review interval. |
| Critical | Pause unsafe manual retries, investigate the affected dependency or policy boundary, and capture safe evidence from runs and audit events. | Escalate to the owner immediately; involve the platform owner for persistence failures and governance owner for repeated blocks. |

For retryable scheduled failures, use the scheduler’s protected retry controls only after confirming that the idempotency key and lease state prevent duplicate external effects. For permanent failures, correct the configuration, payload contract, capability policy, or approval path before scheduling a new attempt.

## Dashboard contract

`GET /api/dashboard` returns an `operationalHealth` object with `metrics` and `alerts`. The object contains only the following metric categories:

- Total, completed, failed, running, and retryable-failed runs.
- Provider and persistence timeout counts.
- Count of blocked audit events.
- Alert key, severity, count, threshold, owner, and safe message.

The dashboard consumer must treat alert output as an operational signal, not an authorization override. Approval and tool-execution rules remain authoritative.
