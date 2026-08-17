# Agents-Gang Task Tracker

This is the human-readable mirror of the GitHub issue backlog. **GitHub issues are the live execution source of truth.** Update this table in the same pull request whenever a task ID changes, a dependency changes, or a milestone is re-planned.

**Status key:** `Backlog` → `Claimed` → `In progress` → `Review` → `Accepted` → `Released`. `Blocked` requires an issue comment naming the blocker and requested decision.

| Task ID | GitHub issue | Priority | Milestone | Direct owner | Depends on | Status | Required acceptance evidence |
|---|---:|---|---|---|---|---|---|
| C0-01 | TBD | P0 | Chapter 0 — Program Control | Codex | — | Backlog | Full CI quality gate green on push and pull request. |
| C0-02 | TBD | P0 | Chapter 0 — Program Control | Manus Agent | — | Backlog | Labels, milestones, issue workflow, and planning references published. |
| C0-03 | TBD | P1 | Chapter 0 — Program Control | SOL 5.6 | C0-02 | Backlog | Release evidence register and decision-log convention documented. |
| C1-01 | TBD | P0 | Chapter 1 — Approval Control Plane | Codex | C0-01 | Backlog | Anonymous/non-founder/founder authorization test matrix passes. |
| C1-02 | TBD | P0 | Chapter 1 — Approval Control Plane | Codex | C1-01 | Backlog | Safe paginated approval repository queries and indexes verified. |
| C1-03 | TBD | P0 | Chapter 1 — Approval Control Plane | Codex | C1-01, C1-02 | Backlog | Protected list/detail API contract and redaction tests pass. |
| C1-04 | TBD | P0 | Chapter 1 — Approval Control Plane | Codex | C1-01, C1-02 | Backlog | Atomic pending-only approve/reject behavior and audit tests pass. |
| C1-05 | TBD | P0 | Chapter 1 — Approval Control Plane | Manus Agent | C1-01 | Backlog | Typed policy registry covers every enabled tool/action. |
| C1-06 | TBD | P0 | Chapter 1 — Approval Control Plane | Codex | C1-03, C1-04, C1-05 | Backlog | Threat model and abuse regressions are reviewed and green. |
| C2-01 | TBD | P0 | Chapter 2 — Founder Operations Surface | SOL 5.6 | C1-03 | Backlog | Accessible approval queue/detail UI reads protected persisted data. |
| C2-02 | TBD | P0 | Chapter 2 — Founder Operations Surface | SOL 5.6 | C1-04, C2-01 | Backlog | Confirmed decision flow handles conflict, expired, and consumed states. |
| C2-03 | TBD | P1 | Chapter 2 — Founder Operations Surface | SOL 5.6 | C1-02 | Backlog | Persisted run/route/tool/audit dashboard with all state handling. |
| C2-04 | TBD | P1 | Chapter 2 — Founder Operations Surface | SOL 5.6 | C2-01, C2-02, C2-03 | Backlog | Founder workflow acceptance suite and test script pass. |
| C3-01 | TBD | P0 | Chapter 3 — Governed Integration Fabric | Manus Agent | C1-05 | Backlog | Shopify test-store contract, policy gates, and failure behavior verified. |
| C3-02 | TBD | P1 | Chapter 3 — Governed Integration Fabric | Manus Agent | C1-05 | Backlog | Gmail read/draft/send policy contract and audit tests pass. |
| C3-03 | TBD | P1 | Chapter 3 — Governed Integration Fabric | Manus Agent | C1-05 | Backlog | Calendar read/prepare/mutate policy and idempotency tests pass. |
| C3-04 | TBD | P1 | Chapter 3 — Governed Integration Fabric | Manus Agent | C1-05 | Backlog | Web/image adapters provide provenance and safe untrusted-content handling. |
| C3-05 | TBD | P0 | Chapter 3 — Governed Integration Fabric | Manus Agent | C3-01–C3-04 as applicable | Backlog | All scheduled jobs use the shared governed execution contract. |
| C4-01 | TBD | P0 | Chapter 4 — Scheduling and Observability | Manus Agent | C3-05 | Backlog | Scheduler supports idempotency, retry taxonomy, concurrency, durable state. |
| C4-02 | TBD | P1 | Chapter 4 — Scheduling and Observability | Codex | C4-01 | Backlog | Protected manual trigger/retry controls and duplicate-delivery tests pass. |
| C4-03 | TBD | P1 | Chapter 4 — Scheduling and Observability | Manus Agent | C4-01 | Backlog | Correlation, metrics, and actionable alert policy documented and tested. |
| C4-04 | TBD | P1 | Chapter 4 — Scheduling and Observability | SOL 5.6 | C2-03, C4-03 | Backlog | Job-health dashboard exposes safe retry/failure state. |
| C5-01 | TBD | P0 | Chapter 5 — Deployment Readiness and Launch | Manus Agent | C1-02, C4-01 | Backlog | Fresh/upgrade migration runner and verification rehearsal pass. |
| C5-02 | TBD | P0 | Chapter 5 — Deployment Readiness and Launch | Codex | C5-01 | Backlog | Fail-closed environment/secret validation tests pass. |
| C5-03 | TBD | P0 | Chapter 5 — Deployment Readiness and Launch | Codex | C0-01, C5-02 | Backlog | Required CI/CD release gates, dependency/secret checks are enforced. |
| C5-04 | TBD | P0 | Chapter 5 — Deployment Readiness and Launch | SOL 5.6 | C2-04, C3-05, C4-04, C5-01–C5-03 | Backlog | Staging soak/founder UAT evidence register is complete. |
| C5-05 | TBD | P0 | Chapter 5 — Deployment Readiness and Launch | Manus Agent | C5-04 | Backlog | Deploy, rollback, incident, and handover runbooks are rehearsal-ready. |
| C5-06 | TBD | P0 | Chapter 5 — Deployment Readiness and Launch | Manus Agent + founder | C5-01–C5-05 | Backlog | Go/no-go record, controlled deploy, post-deploy verification complete. |

## First Three Assignments

| Order | Task | Assignee | Why this is first | Required reviewer |
|---|---|---|---|---|
| 1 | C0-01 | Codex | Establishes the reliable quality gate every later pull request must satisfy. | Manus Agent |
| 2 | C0-02 | Manus Agent | Publishes the work-control mechanics and makes the roadmap executable in GitHub. | Codex |
| 3 | C0-03 | SOL 5.6 | Establishes evidence capture before interface and staging work begins. | Manus Agent |

Do not begin implementation of C1-01, C1-02, C1-03, or C1-04 until C0-01 is accepted. Do not begin any user decision interface until C1-03 and C1-04 have stable, reviewed contracts.
