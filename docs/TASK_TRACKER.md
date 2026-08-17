# Agents-Gang Task Tracker

Status values mean **Complete locally** when code and tests exist in the current working branch but the change has not yet been merged; **Next** is the task currently selected for implementation; **Open** means planned but not started.

| Task | Work item | Status | Notes |
|---|---|---|---|
| C0-01 | Program blueprint and issue decomposition | Complete locally | Repository now has a durable implementation track and issue-linked work. |
| C1-C2 | Governed execution foundation, approvals, and operations surface | Complete locally | Approval API, persisted dashboard, repository mappings, and browser coverage are present. |
| C3-01 | Shopify production adapter boundary and test-store contract | Complete locally | Injected test-store client, normalized rate-limit/auth/network/GraphQL/malformed errors, and safe read transport coverage are passing. Mutations remain disabled by default. |
| C3-02 | Gmail adapter | Complete locally for read path | `gmail.search` is governed; draft, label, and summarize paths remain explicitly unavailable. |
| C3-03 | Calendar adapter | Open | Requires narrow read and scheduling contracts. |
| C3-04 | Provenance and web-search adapter | Complete locally for read path | `web.search` is governed with injected readers and bounded queries. |
| C3-05 | Route scheduled jobs through common execution contract | Complete locally | All four scheduled jobs use the shared runner. |
| C4-01 | Durable scheduler, idempotency, and worker leases | Complete locally | In-memory and Supabase lease paths, expiry, contention, and release are covered. |
| C4-02 | Protected manual trigger and retry controls | Open | Depends on operator authorization and scheduler API surface. |
| C4-03 | Correlation, metrics, and alert policy | **Next** | Add correlation IDs, payload-safe metrics, alert thresholds, and operational runbook updates. |
| C4-04 | Job health and healing controls | Open | Depends on C4-02 and C4-03. |
| C5 | Production hardening and go/no-go | Open | Requires deployment, soak, CI/CD, and staging evidence. |
