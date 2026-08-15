# Agents-Gang

Melato Agent Swarm / Melato OS is a private squad of specialist agents for product-page audits, creative direction, Shopify operations, visual QA, concierge support, trend radar, finance, and career/life administration.

## Execution leadership

**Manus is the Senior Execution Lead / Chief Builder for bounded engineering missions.**

Manus is expected to carry assigned work from repository inspection through implementation, validation, and handoff. Reversible engineering work inside an approved mission does not require repeated per-file approval.

Claude remains an active specialist reasoning and architecture advisor. Codex / ChatGPT remains the repository operations, integration, CI, review, and connected-tool partner. Grok has no standing project role.

This collaboration model is separate from the application's current AI provider plumbing. The current `/api/chat` implementation still calls Anthropic directly. A future Manus runtime integration must use a real supported interface and must not be simulated with a fake SDK or misleading adapter.

See:

- [`docs/MANUS_EXECUTION_HANDOFF.md`](docs/MANUS_EXECUTION_HANDOFF.md)
- [`docs/COLLABORATION_PROTOCOL.md`](docs/COLLABORATION_PROTOCOL.md)

## Phase 1 MVP

The current build focuses on a safe read/draft-only agent brain:

1. A user sends a message to `/api/chat`.
2. The Orchestrator routes the request to the best specialist agent.
3. The selected specialist replies with a structured result.
4. No external Shopify, Gmail, calendar, or database actions are executed automatically.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Fill `.env` with real credentials locally. Do not commit `.env`.

`ANTHROPIC_MODEL` is optional and lets deployments select a different model without a code change. The chat endpoint accepts JSON in the form `{"message":"..."}` and limits messages to 10,000 characters. Provider calls time out after 30 seconds and return a structured JSON error if routing or the provider response is invalid.

## Safety Defaults

The runtime is currently conservative while the execution layer is being built out:

- Default application risk level is read-only or draft-only.
- Shopify publishing requires approval.
- Email sending requires approval.
- Price changes require approval.
- Deletion requires approval.
- Missing product specs must be marked as missing instead of invented.

For project development itself, Manus has broader authority over reversible engineering work as defined in the execution handoff. Production-sensitive actions still require human approval.
