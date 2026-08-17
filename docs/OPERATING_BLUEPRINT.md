# Agents-Gang Operating Blueprint

## Current operating state

Agents-Gang is a governed execution system. External work must flow through a narrow tool contract, durable execution records, approval gates for elevated risk, structured audit events, and the shared scheduled-job lifecycle.

| Capability | Current state | Evidence in repository |
|---|---|---|
| Durable execution records | Implemented locally; review pending | `lib/execution/repository.ts`, `lib/execution/supabase-repository.ts` |
| Approval queue and decisions | Implemented locally; review pending | `app/api/approvals`, `app/approvals` |
| Persisted dashboard | Implemented locally; review pending | `app/api/dashboard`, `app/dashboard` |
| Browser and Supabase integration tests | Implemented and passing locally | `e2e/`, `playwright.config.ts` |
| Governed scheduled jobs | Implemented for product scan, daily audit, inbox triage, and trend radar | `jobs/`, `tools/` |
| Idempotency and worker leases | Implemented locally; migration and RPC definitions included | `jobs/scheduledJobRunner.ts`, `db/migrations/20260815_governed_execution_up.sql` |
| Production Shopify boundary | Implemented locally; review pending | `tools/shopify.ts`, `tests/shopify-products-tool.test.ts` |
| Correlation and operational alerts | Implemented locally; review pending | `lib/observability/operational-health.ts`, `docs/OBSERVABILITY_RUNBOOK.md` |
| Protected operator controls | Implemented locally; review pending | `app/api/jobs/route.ts`, `lib/scheduler/manual-job-controls.ts`, `docs/OPERATOR_CONTROL_RUNBOOK.md` |

## Non-negotiable execution rules

1. Read operations use narrow, validated inputs and injected authenticated readers.
2. Draft and mutation operations remain distinct from reads and require explicit capability policy.
3. Risk level 3 or 4 actions require durable approval validation before execution.
4. Scheduled jobs acquire a durable lease, use an idempotency key, persist lifecycle transitions, and release the lease on every terminal path.
5. Logs, dashboards, and audit records contain summaries and safe metadata only; credentials, raw prompts, and protected payloads are excluded.
6. Operational health summaries expose safe counts and alert states only; response procedures and escalation owners are documented in `docs/OBSERVABILITY_RUNBOOK.md`.
7. Manual scheduler controls are fail-closed, require an operator role and server credential, accept only eligible jobs, and preserve idempotency, retry budgets, and audit trails.
8. Every task is implemented behavior-first, verified with the repository’s lint, typecheck, unit, end-to-end, and build checks, and left reviewable on a dedicated branch.
