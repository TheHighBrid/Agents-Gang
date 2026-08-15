# Agents-Gang / Melato OS

Melato OS is a private, specialist-agent operating system for product-page audits, creative direction, Shopify operations, visual QA, concierge support, trend research, finance, and career administration. The current implementation is a **governed execution foundation**: requests are routed through a provider-neutral AI boundary, high-risk tool calls are approval-gated in code, and executions are designed to persist a reviewable audit trail.

## Runtime architecture

The `/api/chat` route validates the user request, selects the configured AI provider, creates the durable execution repository, and delegates routing and specialist execution to the chat service. The route does not contain Anthropic request or response parsing. `lib/ai/contracts.ts` defines the typed provider interface, while `lib/ai/anthropic-provider.ts` is the current adapter. No Manus runtime adapter is present or simulated.

| Layer | Responsibility | Current implementation |
| --- | --- | --- |
| Provider boundary | Typed generation requests, responses, timeout errors, and provider configuration | `lib/ai/*`; Anthropic adapter selected with `AI_PROVIDER=anthropic` |
| Chat service | Orchestrator validation, agent selection, specialist dispatch, and run persistence | `lib/chat/chat-service.ts` |
| Approval engine | Risk validation and level-3/4 approval enforcement | `lib/execution/approval-engine.ts` |
| Tool contract | Capability class, validated input, structured result/failure, approval lookup, tool-call record, and audit event | `lib/execution/tool-execution.ts` |
| Durable repository | Supabase REST persistence for runs, routing decisions, approvals, tool calls, and audit events | `lib/execution/supabase-repository.ts` |
| Reference adapter | Governed Shopify product read | `tools/shopify-products-tool.ts` |

> **Safety boundary:** risk levels 1 and 2 may proceed according to their declared capability. Risk levels 3 and 4 require an approval record resolved from the repository, with an approved status, matching action, matching target, and no expired authorization window. A caller-supplied approval object cannot bypass this gate.

## Setup

Install dependencies, create a local environment file, configure the required credentials, then start the development server.

```bash
npm install
cp .env.example .env
npm run dev
```

The normal governed runtime requires both an AI provider and Supabase execution persistence. The service-role key is server-only and must never be exposed to a browser client or committed to source control.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | Yes | Provider selector. The supported value is `anthropic`. |
| `ANTHROPIC_API_KEY` | Yes | Server-side Anthropic API key. |
| `ANTHROPIC_MODEL` | No | Anthropic model override; defaults to `claude-opus-4-8`. |
| `SUPABASE_URL` | Yes | Supabase project URL used for durable governed-execution records. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only key used by the execution repository. |
| `SHOPIFY_STORE_DOMAIN` | When Shopify reads run | Shopify store domain. |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | When Shopify reads run | Server-only Shopify Admin API token. |

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

## Execution roadmap

The highest-impact remaining work is intentionally ordered by dependency.

1. Build authenticated approval APIs and make the approvals dashboard display and decide persisted approval records.
2. Route each remaining real adapter and scheduled job through the common execution contract.
3. Add a production migration runner and deployment-level Supabase verification.
4. Add real tool adapters and capability policies for Shopify draft updates, Gmail, Calendar, image audit, and web search.
5. Expand the dashboard with persisted run, routing, approval, and audit-event state.
6. Add additional AI providers only through documented, supported provider adapters.

## Project operating model

Manus is the Senior Execution Lead for bounded engineering missions. Claude serves as an architecture and reasoning advisor when useful. Codex / ChatGPT supports repository operations, integration, CI, debugging, and independent review. The human sponsor retains approval over production credentials, billing, destructive live-data operations, customer-facing sends, Shopify publishing, live price changes, and irreversible production actions.

See [`docs/MANUS_EXECUTION_HANDOFF.md`](docs/MANUS_EXECUTION_HANDOFF.md) and [`docs/COLLABORATION_PROTOCOL.md`](docs/COLLABORATION_PROTOCOL.md) for the operating charter.
