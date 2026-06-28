# Agents-Gang

Melato Agent Swarm / Melato OS is a private squad of specialist agents for product-page audits, creative direction, Shopify operations, visual QA, concierge support, trend radar, finance, and career/life administration.

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

## Safety Defaults

- Default risk level is read-only or draft-only.
- Shopify publishing requires approval.
- Email sending requires approval.
- Price changes require approval.
- Deletion requires approval.
- Missing product specs must be marked as missing instead of invented.
