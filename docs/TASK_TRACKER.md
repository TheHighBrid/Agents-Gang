# Agents-Gang Task Tracker

This is the human-readable mirror of the GitHub issue backlog. **GitHub issues are the live execution source of truth.** Update this table in the same pull request whenever a task ID changes, a dependency changes, or a milestone is re-planned.

Release proof and material implementation decisions are indexed in the [Release Evidence Register](./RELEASE_EVIDENCE_REGISTER.md) and [Decision Log](./DECISION_LOG.md).

**Status key:** `Backlog` → `Claimed` → `In progress` → `Review` → `Accepted` → `Released`. `Blocked` requires an issue comment naming the blocker and requested decision.

| Task ID | GitHub issue | Priority | Milestone | Direct owner | Depends on | Status | Required acceptance evidence |
|---|---:|---|---|---|---|---|---|
| C0-01 | [#10](https://github.com/TheHighBrid/Agents-Gang/issues/10) | P0 | Chapter 0 — Program Control | Codex | — | Backlog | Full CI quality gate green on push and pull request. |
| C0-02 | [#11](https://github.com/TheHighBrid/Agents-Gang/issues/11) | P0 | Chapter 0 — Program Control | Manus Agent | — | Backlog | Labels, milestones, issue workflow, and planning references published. |
| C0-03 | [#12](https://github.com/TheHighBrid/Agents-Gang/issues/12) | P1 | Chapter 0 — Program Control | SOL 5.6 | C0-02 | In progress | Release evidence register and decision-log convention documented. |
| C1-01 | [#13](https://github.com/TheHighBrid/Agents-Gang/issues/13) | P0 | Chapter 1 — Approval Control Plane | Codex | C0-01 | Backlog | Anonymous/non-founder/founder authorization test matrix passes. |
| C1-02 | [#14](https://github.com/TheHighBrid/Agents-Gang/issues/14) | P0 | Chapter 1 — Approval Control Plane | Codex | C1-01 | Backlog | Safe paginated approval repository queries and indexes verified. |
| C1-03 | [#15](https://github.com/TheHighBrid/Agents-Gang/issues/15) | P0 | Chapter 1 — Approval Control Plane | Codex | C1-01, C1-02 | Backlog | Protected list/detail API contract and redaction tests pass. |
| C1-04 | [#16](https://github.com/TheHighBrid/Agents-Gang/issues/16) | P0 | Chapter 1 — Approval Control Plane | Codex | C1-01, C1-02 | Backlog | Atomic pending-only approve/reject behavior and audit tests pass. |
| C1-05 | [#17](https://github.com/TheHighBrid/Agents-Gang/issues/17) | P0 | Chapter 1 — Approval Control Plane | Manus Agent | C1-01 | Backlog | Typed policy registry covers every enabled tool/action. |
| C1-06 | [#18](https://github.com/TheHighBrid/Agents-Gang/issues/18) | P0 | Chapter 1 — Approval Control Plane | Codex | C1-03, C1-04, C1-05 | Backlog | Threat model and abuse regressions are reviewed and green. |
| C2-01 | [#19](https://github.com/TheHighBrid/Agents-Gang/issues/19) | P0 | Chapter 2 — Founder Operations Surface | SOL 5.6 | C1-03 | Backlog | Accessible approval queue/detail UI reads protected persisted data. |
| C2-02 | [#20](https://github.com/TheHighBrid/Agents-Gang/issues/20) | P0 | Chapter 2 — Founder Operations Surface | SOL 5.6 | C1-04, C2-01 | Backlog | Confirmed decision flow handles conflict, expired, and consumed states. |
| C2-03 | [#21](https://github.com/TheHighBrid/Agents-Gang/issues/21) | P1 | Chapter 2 — Founder Operations Surface | SOL 5.6 | C1-02 | Backlog | Persisted run/route/tool/audit dashboard with all state handling. |
| C2-04 | [#22](https://github.com/TheHighBrid/Agents-Gang/issues/22) | P1 | Chapter 2 — Founder Operations Surface | SOL 5.6 | C2-01, C2-02, C2-03 | Backlog | Founder workflow acceptance suite and test script pass. |
| C3-01 | [#23](https://github.com/TheHighBrid/Agents-Gang/issues/23) | P0 | Chapter 3 — Governed Integration Fabric | Manus Agent | C1-05 | Backlog | Shopify test-store contract, policy gates, and failure behavior verified. |
| C3-02 | [#24](https://github.com/TheHighBrid/Agents-Gang/issues/24) | P1 | Chapter 3 — Governed Integration Fabric | Manus Agent | C1-05 | Backlog | Gmail read/draft/send policy contract and audit tests pass. |
| C3-03 | [#25](https://github.com/TheHighBrid/Agents-Gang/issues/25) | P1 | Chapter 3 — Governed Integration Fabric | Manus Agent | C1-05 | Backlog | Calendar read/prepare/mutate policy and idempotency tests pass. |
| C3-04 | [#26](https://github.com/TheHighBrid/Agents-Gang/issues/26) | P1 | Chapter 3 — Governed Integration Fabric | Manus Agent | C1-05 | Backlog | Web/image adapters provide provenance and safe untrusted-content handling. |
| C3-05 | [#27](https://github.com/TheHighBrid/Agents-Gang/issues/27) | P0 | Chapter 3 — Governed Integration Fabric | Manus Agent | C3-01–C3-04 as applicable | Backlog | All scheduled jobs use the shared governed execution contract. |
| C4-01 | [#28](https://github.com/TheHighBrid/Agents-Gang/issues/28) | P0 | Chapter 4 — Scheduling and Observability | Manus Agent | C3-05 | Backlog | Scheduler supports idempotency, retry taxonomy, concurrency, durable state. |
| C4-02 | [#29](https://github.com/TheHighBrid/Agents-Gang/issues/29) | P1 | Chapter 4 — Scheduling and Observability | Codex | C4-01 | Backlog | Protected manual trigger/retry controls and duplicate-delivery tests pass. |
| C4-03 | [#30](https://github.com/TheHighBrid/Agents-Gang/issues/30) | P1 | Chapter 4 — Scheduling and Observability | Manus Agent | C4-01 | Backlog | Correlation, metrics, and actionable alert policy documented and tested. |
| C4-04 | [#31](https://github.com/TheHighBrid/Agents-Gang/issues/31) | P1 | Chapter 4 — Scheduling and Observability | SOL 5.6 | C2-03, C4-03 | Backlog | Job-health dashboard exposes safe retry/failure state. |
| C5-01 | [#32](https://github.com/TheHighBrid/Agents-Gang/issues/32) | P0 | Chapter 5 — Deployment Readiness and Launch | Manus Agent | C1-02, C4-01 | Backlog | Fresh/upgrade migration runner and verification rehearsal pass. |
| C5-02 | [#33](https://github.com/TheHighBrid/Agents-Gang/issues/33) | P0 | Chapter 5 — Deployment Readiness and Launch | Codex | C5-01 | Backlog | Fail-closed environment/secret validation tests pass. |
| C5-03 | [#34](https://github.com/TheHighBrid/Agents-Gang/issues/34) | P0 | Chapter 5 — Deployment Readiness and Launch | Codex | C0-01, C5-02 | Backlog | Required CI/CD release gates, dependency/secret checks are enforced. |
| C5-04 | [#35](https://github.com/TheHighBrid/Agents-Gang/issues/35) | P0 | Chapter 5 — Deployment Readiness and Launch | SOL 5.6 | C2-04, C3-05, C4-04, C5-01–C5-03 | Backlog | Staging soak/founder UAT evidence register is complete. |
| C5-05 | [#36](https://github.com/TheHighBrid/Agents-Gang/issues/36) | P0 | Chapter 5 — Deployment Readiness and Launch | Manus Agent | C5-04 | Backlog | Deploy, rollback, incident, and handover runbooks are rehearsal-ready. |
| C5-06 | [#37](https://github.com/TheHighBrid/Agents-Gang/issues/37) | P0 | Chapter 5 — Deployment Readiness and Launch | Manus Agent + founder | C5-01–C5-05 | Backlog | Go/no-go record, controlled deploy, post-deploy verification complete. |

## First Three Assignments

| Order | Task | Assignee | Why this is first | Required reviewer |
|---|---|---|---|---|
| 1 | C0-01 | Codex | Establishes the reliable quality gate every later pull request must satisfy. | Manus Agent |
| 2 | C0-02 | Manus Agent | Publishes the work-control mechanics and makes the roadmap executable in GitHub. | Codex |
| 3 | C0-03 | SOL 5.6 | Establishes evidence capture before interface and staging work begins. | Manus Agent |

Do not begin implementation of C1-01, C1-02, C1-03, or C1-04 until C0-01 is accepted. Do not begin any user decision interface until C1-03 and C1-04 have stable, reviewed contracts.
