# Agents-Gang Task Tracker

This is the human-readable mirror of the GitHub issue backlog. **GitHub issues are the live execution source of truth.** Update this table in the same pull request whenever a task ID changes, a dependency changes, or a milestone is re-planned.

Release proof and material implementation decisions are indexed in the [Release Evidence Register](./RELEASE_EVIDENCE_REGISTER.md) and [Decision Log](./DECISION_LOG.md).

**Status key:** `Backlog` -> `Claimed` -> `In progress` -> `Review` -> `Accepted` -> `Released`. `Blocked` requires an issue comment naming the blocker and requested decision.

| Task ID | GitHub issue | Priority | Milestone | Direct owner | Depends on | Status | Required acceptance evidence |
|---|---:|---|---|---|---|---|---|
| C0-01 | [#10](https://github.com/TheHighBrid/Agents-Gang/issues/10) | P0 | Chapter 0 - Program Control | Codex | - | Accepted | Full CI quality gate green on push and pull request. |
| C0-02 | [#11](https://github.com/TheHighBrid/Agents-Gang/issues/11) | P0 | Chapter 0 - Program Control | Manus Agent | - | Accepted | Labels, milestones, issue workflow, and planning references published. |
| C0-03 | [#12](https://github.com/TheHighBrid/Agents-Gang/issues/12) | P1 | Chapter 0 - Program Control | SOL 5.6 | C0-02 | Accepted | Release evidence register and decision-log convention documented and issue closed. |
| C1-01 | [#13](https://github.com/TheHighBrid/Agents-Gang/issues/13) | P0 | Chapter 1 - Approval Control Plane | Codex | C0-01 | Accepted | Anonymous/non-founder/founder authorization test matrix passes. |
| C1-02 | [#14](https://github.com/TheHighBrid/Agents-Gang/issues/14) | P0 | Chapter 1 - Approval Control Plane | Codex | C1-01 | Accepted | Safe paginated approval repository queries and indexes verified. |
| C1-03 | [#15](https://github.com/TheHighBrid/Agents-Gang/issues/15) | P0 | Chapter 1 - Approval Control Plane | Codex | C1-01, C1-02 | Accepted | Protected list/detail API contract and redaction tests pass. |
| C1-04 | [#16](https://github.com/TheHighBrid/Agents-Gang/issues/16) | P0 | Chapter 1 - Approval Control Plane | Codex | C1-01, C1-02 | Accepted | Atomic pending-only approve/reject behavior and audit tests pass. |
| C1-05 | [#17](https://github.com/TheHighBrid/Agents-Gang/issues/17) | P0 | Chapter 1 - Approval Control Plane | Manus Agent | C1-01 | Accepted | Typed policy registry covers every enabled tool/action and is enforced at execution. |
| C1-06 | [#18](https://github.com/TheHighBrid/Agents-Gang/issues/18) | P0 | Chapter 1 - Approval Control Plane | Codex | C1-03, C1-04, C1-05 | Accepted | Threat model and abuse regressions are merged and green; final release review retains the documented independent-review caveat. |
| C2-01 | [#19](https://github.com/TheHighBrid/Agents-Gang/issues/19) | P0 | Chapter 2 - Founder Operations Surface | SOL 5.6 | C1-03 | Accepted | Accessible approval queue/detail UI reads protected persisted data. |
| C2-02 | [#20](https://github.com/TheHighBrid/Agents-Gang/issues/20) | P0 | Chapter 2 - Founder Operations Surface | SOL 5.6 | C1-04, C2-01 | Accepted | Confirmed decision flow handles conflict, expired, and consumed states. |
| C2-03 | [#21](https://github.com/TheHighBrid/Agents-Gang/issues/21) | P1 | Chapter 2 - Founder Operations Surface | SOL 5.6 | C1-02 | Accepted | Persisted run/route/tool/audit dashboard with all state handling. |
| C2-04 | [#22](https://github.com/TheHighBrid/Agents-Gang/issues/22) | P1 | Chapter 2 - Founder Operations Surface | SOL 5.6 | C2-01, C2-02, C2-03 | Accepted | Founder workflow sandbox acceptance is merged; staging evidence remains C5-04. |
| C3-01 | [#23](https://github.com/TheHighBrid/Agents-Gang/issues/23) | P0 | Chapter 3 - Governed Integration Fabric | Manus Agent | C1-05 | Accepted | Shopify test-store contract, policy gates, and failure behavior verified. |
| C3-02 | [#24](https://github.com/TheHighBrid/Agents-Gang/issues/24) | P1 | Chapter 3 - Governed Integration Fabric | Manus Agent | C1-05 | Accepted | Gmail read/draft/send policy contract and audit tests pass. |
| C3-03 | [#25](https://github.com/TheHighBrid/Agents-Gang/issues/25) | P1 | Chapter 3 - Governed Integration Fabric | Manus Agent | C1-05 | Backlog | Calendar read/prepare/mutate policy and idempotency tests pass. |
| C3-04 | [#26](https://github.com/TheHighBrid/Agents-Gang/issues/26) | P1 | Chapter 3 - Governed Integration Fabric | Manus Agent | C1-05 | Backlog | Web/image adapters provide provenance and safe untrusted-content handling. |
| C3-05 | [#27](https://github.com/TheHighBrid/Agents-Gang/issues/27) | P0 | Chapter 3 - Governed Integration Fabric | Manus Agent | C3-01-C3-04 as applicable | Accepted | Enabled scheduled jobs use the shared governed execution contract. |
| C4-01 | [#28](https://github.com/TheHighBrid/Agents-Gang/issues/28) | P0 | Chapter 4 - Scheduling and Observability | Manus Agent | C3-05 | Accepted | Durable scheduler supports idempotency, retry taxonomy, concurrency, cancellation boundary, and durable state. |
| C4-02 | [#29](https://github.com/TheHighBrid/Agents-Gang/issues/29) | P1 | Chapter 4 - Scheduling and Observability | Codex | C4-01 | Accepted | Protected manual trigger/retry controls and duplicate-delivery tests pass. |
| C4-03 | [#30](https://github.com/TheHighBrid/Agents-Gang/issues/30) | P1 | Chapter 4 - Scheduling and Observability | Manus Agent | C4-01 | Accepted | Correlation, metrics, payload-safe logs, and actionable alert policy are documented and tested. |
| C4-04 | [#31](https://github.com/TheHighBrid/Agents-Gang/issues/31) | P1 | Chapter 4 - Scheduling and Observability | SOL 5.6 | C2-03, C4-03 | Accepted | Job-health dashboard exposes safe retry/failure/correlation state and operational alerts. |
| C5-01 | [#32](https://github.com/TheHighBrid/Agents-Gang/issues/32) | P0 | Chapter 5 - Deployment Readiness and Launch | Manus Agent | C1-02, C4-01 | Accepted | Fresh/upgrade migration runner and PostgreSQL verification rehearsal pass. |
| C5-02 | [#33](https://github.com/TheHighBrid/Agents-Gang/issues/33) | P0 | Chapter 5 - Deployment Readiness and Launch | Codex | C5-01 | Accepted | Fail-closed environment/secret validation, feature isolation, and redaction checks pass. |
| C5-03 | [#34](https://github.com/TheHighBrid/Agents-Gang/issues/34) | P0 | Chapter 5 - Deployment Readiness and Launch | Codex | C0-01, C5-02 | Blocked | In-repo release gate is merged and exact-head verified. GitHub `main` platform enforcement and a promotable post-merge `main` manifest remain required. |
| C5-04 | [#35](https://github.com/TheHighBrid/Agents-Gang/issues/35) | P0 | Chapter 5 - Deployment Readiness and Launch | SOL 5.6 | C2-04, C3-05, C4-04, C5-01-C5-03 | Blocked | Staging soak/founder UAT cannot be accepted until C5-03 platform enforcement is verified or an explicit release exception is documented. |
| C5-05 | [#36](https://github.com/TheHighBrid/Agents-Gang/issues/36) | P0 | Chapter 5 - Deployment Readiness and Launch | Manus Agent | C5-04 | In progress | Deploy, rollback, incident, and handover runbooks are rehearsal-ready. |
| C5-06 | [#37](https://github.com/TheHighBrid/Agents-Gang/issues/37) | P0 | Chapter 5 - Deployment Readiness and Launch | Manus Agent + founder | C5-01-C5-05 | Backlog | Go/no-go record, controlled deploy, post-deploy verification complete. |

## Current execution order

1. **C5-03 platform control:** verify or configure the GitHub `main` ruleset and capture a push-triggered Release gate manifest with `releaseEligible=true`.
2. **C5-04:** staging soak and founder UAT after C5-03 is actually satisfied.
3. **C5-05:** deployment, rollback, incident, mutation-disable, and handover rehearsal.
4. **C5-06:** founder go/no-go, controlled production deployment, post-deploy verification, and rollback watch.
5. **Parallel non-blocking integration work:** C3-03 and C3-04 may proceed under their Manus ownership but must not be mistaken for the release blocker.

## Execution discipline

- GitHub issue state is authoritative; this tracker is a mirror.
- Work starts from current `main` unless the dependency graph explicitly requires another base.
- One task ID per implementation PR unless a dependency is inseparable and documented.
- Exact-head merge-context CI is the verification authority after `main` changes.
- A stale green run is not release evidence.
- Failed or conflicted branches are repaired or superseded, never counted as progress.
- Production promotion requires the release evidence register and the founder go/no-go. A green workflow is necessary evidence, not independent deployment authorization.
