# Agents-Gang / Melato OS

Melato OS is a private, specialist-agent operating system for product-page audits, creative direction, Shopify operations, visual QA, concierge support, trend research, finance, and career administration. The current implementation is a **governed execution foundation**: requests are routed through a provider-neutral AI boundary, high-risk tool calls are approval-gated in code, and executions are designed to persist a reviewable audit trail.

## Phase 1 MVP

Apply `db/schema.sql` to a fresh Supabase project. Existing deployments should first apply `db/migrations/20260815_governed_execution_up.sql`. The paired `20260815_governed_execution_down.sql` reverses the migration; use it only after confirming no governed-execution records must be retained.

## Validation

Run all checks before opening a pull request or declaring a change complete.

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

The test suite covers provider timeout normalization, provider configuration, malformed orchestrator routing, unknown agents, durable run and routing-decision recording, risk-level validation, expired approval rejection, approval lifecycle transitions, high-risk approval and target binding, structured tool failures, Shopify reference-tool execution, scheduled-job contract reuse, Supabase request mapping, and payload-safe structured logging.

## Execution model

A typical governed operation follows this sequence:

1. The orchestrator produces a validated route plan with an agent, risk level, and required tools.
2. The chat service creates an agent run and routing decision in the configured execution repository.
3. A tool is declared with a capability class: `read`, `draft`, `prepare`, or `execute`.
4. For risk level 3 or 4, the runner loads the referenced approval from durable storage and validates its status, action, target, and expiry.
5. The runner writes a `tool_calls` record and a structured `audit_events` record for blocked, failed, and successful outcomes.

The current product-page scan job invokes Shopify through this same tool contract; it no longer calls the Shopify adapter directly.

## Approval desk

The `/approvals` page provides a persisted approval queue backed by the execution repository. Configure the server-side `FOUNDER_AUTH_SECRET` before using the approval or observability APIs. Those APIs accept only signed founder-session credentials, resolve identity and role in server code, deny anonymous, malformed, expired, revoked, and non-founder sessions by default, and support queue loading plus explicit approve/reject decisions with a required decision note. The signing secret and revocation configuration must remain server-side and must never be exposed through client configuration, logs, or committed files.

## Execution roadmap

`ANTHROPIC_MODEL` is optional and lets deployments select a different model
without a code change. The chat endpoint accepts JSON in the form
`{"message":"..."}` and limits messages to 10,000 characters. Provider calls
time out after 30 seconds and return a structured JSON error if routing or the
provider response is invalid.

1. Build authenticated approval APIs and make the approvals dashboard display and decide persisted approval records. **Complete.**
2. Route each remaining real adapter and scheduled job through the common execution contract.
3. Add a production migration runner and deployment-level Supabase verification.
4. Add real tool adapters and capability policies for Shopify draft updates, Gmail, Calendar, image audit, and web search.
5. Expand the dashboard with persisted run, routing, approval, and audit-event state.
6. Add additional AI providers only through documented, supported provider adapters.

- Default risk level is read-only or draft-only.
- Shopify publishing requires approval.
- Email sending requires approval.
- Price changes require approval.
- Deletion requires approval.
- Missing product specs must be marked as missing instead of invented.
