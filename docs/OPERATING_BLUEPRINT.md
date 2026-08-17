# Agents-Gang Operational Completion Blueprint

> **Mission.** Turn Melato OS from a governed-execution foundation into a secure, observable, tested, deployable operating system for product intelligence, Shopify operations, creative direction, customer support, trend research, finance, and career administration.

**Planning horizon:** 10 delivery weeks beginning **17 August 2026**. This is an execution plan, not an authorization to weaken safety controls. Any production mutation must remain protected by the existing approval, payload-binding, audit, and one-time-consumption contracts.

## 1. Final Goal and Definition of Done

The project is complete only when a founder can use a deployed Melato OS to submit a request, receive a governed result, review any prepared high-risk action in a protected approvals interface, approve or reject it, and obtain a durable audit trail. Shopify mutations must run only after a matching, non-expired, unconsumed approval. Gmail sending, price changes, publishing, deletion, and any other externally visible mutation must have equivalent policy enforcement before production enablement.

| Completion dimension | Required outcome | Evidence required |
|---|---|---|
| **Product operation** | The dashboard shows live runs, routing decisions, approvals, tool calls, and audit events from Supabase. | End-to-end browser acceptance test and production-like demo script. |
| **Governance** | Every high-risk action is policy-classified, payload-bound, approval-gated, atomically consumed, and audited. | Contract tests, integration tests, and a reviewed policy matrix. |
| **Integrations** | Shopify read/write, Gmail, Calendar, image audit, and web search have real adapters or are explicitly disabled behind capability flags. | Adapter tests using sandbox/test accounts plus failure-mode coverage. |
| **Scheduling** | Scheduled jobs run through the shared execution contract, are idempotent, and expose run status and failure signals. | Trigger tests, duplicate-delivery tests, and operational runbook. |
| **Deployment** | CI gates, database migration procedure, environment validation, staging verification, monitoring, rollback, and launch checklist are in place. | Green CI, migration rehearsal, staging soak evidence, and signed release checklist. |
| **Security and privacy** | No secrets are committed; all decision endpoints are authenticated and authorized; logs are payload-safe. | Secret scan, authorization tests, log-redaction tests, and security review. |

> **Non-negotiable rule:** a green unit test suite does not authorize deployment by itself. Release requires all completion dimensions above.

## 2. Current Baseline

The repository currently has a provider-neutral chat route, specialist prompts, Supabase execution persistence, structured logs, durable run/routing/tool/audit records, Shopify read and mutation contracts, basic scheduled-job contracts, and a code-level approval system. High-risk tool execution already checks action, target, canonical payload digest, expiry, and one-time consumption.

The material gaps are authenticated approval APIs and user interface, persisted operational views, production migration execution, adapter completion and capability controls, scheduler delivery semantics, broader CI/deployment verification, and launch operations. The current dashboard and approvals pages are placeholders and must not be described as operational before Chapters 2 and 3 are accepted.

## 3. Operating Model for Manus Agent, Codex, and SOL 5.6

The three agents share one delivery objective but do not share unbounded authority. Each task has one **directly responsible agent**; other agents may review or support it. A task cannot be closed without the owner’s verification evidence and an independent review for safety-critical changes.

| Agent | Primary mission | Best-fit responsibilities | Mandatory guardrails |
|---|---|---|---|
| **Manus Agent** | Integration, operations, and release owner. | Architecture decisions, external adapters, migrations, environment validation, scheduling, deployment/runbooks, cross-cutting security fixes. | Do not activate real mutations or deploy without explicit founder approval and documented staging evidence. |
| **Codex** | Contract, test, and review owner. | API contracts, repository interfaces, policy enforcement, test design, CI, regression repair, code review of security-critical pull requests. | Treat external review feedback as suggestions to verify; require failing regression coverage before production bug fixes. |
| **SOL 5.6** | Product workflow and interface owner. | Dashboard/approvals UX, accessibility, operator journeys, seeded/demo data, acceptance criteria, interface-focused tests, documentation clarity. | Do not bypass server-side authorization from the UI; all controls must rely on protected APIs. |

### Shared execution protocol

1. **Claim one GitHub issue.** Set the issue assignee or comment `Owner: <agent>; status: in progress; branch: <branch>` before editing.
2. **Work on a feature branch.** Use `agent/<issue>-<short-name>`; never write implementation commits directly to `main`.
3. **Write the failing test first** for every behavior change or defect. Record the red and green commands in the pull request.
4. **Keep scope bounded.** Do not mix unrelated refactors, dependency upgrades, or aesthetic work into a safety/integration task.
5. **Open a pull request with evidence.** Include scope, threat/rollback notes where relevant, acceptance criteria, and exact validation output.
6. **Require review.** Codex reviews policy, persistence, tests, and security-sensitive changes. SOL 5.6 reviews user-facing workflows. Manus reviews integration/deployment impact.
7. **Close only after merge and verification.** Update the issue checklist and the task tracker after the default branch contains the change.

## 4. Milestone Chapters

The milestone order is deliberate. Later chapters must not start their release-critical work until earlier governance prerequisites are accepted. Parallel work is allowed only where the dependency column permits it.

| Chapter / milestone | Objective | Exit gate | Direct owner | Target window |
|---|---|---|---|---|
| **Chapter 0 — Program Control** | Establish shared workflow, labels, milestones, baseline CI, and branch discipline. | Blueprint published; issues filed; CI runs full quality gate. | Manus Agent | Week 0–1 |
| **Chapter 1 — Approval Control Plane** | Deliver secure, authenticated, durable approval APIs and state transitions. | Authorized founder can list, inspect, approve, reject, and observe one-time consumption. | Codex | Week 1–3 |
| **Chapter 2 — Founder Operations Surface** | Deliver approvals and operations dashboard backed by persisted data. | Founder can perform the core review workflow accessibly without bypassing governance. | SOL 5.6 | Week 2–5 |
| **Chapter 3 — Governed Integration Fabric** | Route real adapters and jobs through explicit capability policies. | Each enabled adapter has policy, tests, audit behavior, and safe failure modes. | Manus Agent | Week 3–7 |
| **Chapter 4 — Scheduling and Observability** | Make jobs reliable, inspectable, and actionable. | Scheduled work is idempotent, correlated, retry-safe, and visible in dashboard/alerts. | Manus Agent | Week 5–8 |
| **Chapter 5 — Deployment Readiness and Launch** | Rehearse migration, staging, security, release, rollback, and operator handover. | Go/no-go checklist passes and deployment runbook is executable. | Manus Agent | Week 7–10 |

## 5. Issue-Ready Work Breakdown Structure

All items below must be created as GitHub issues using their task ID in the title. The accompanying `docs/AGENT_WORK_ORDERS.md` supplies detailed instructions and acceptance tests for each agent. A task may move to Done only when every acceptance item is objectively met.

### Chapter 0 — Program Control

| ID | Task | Owner | Dependencies | Acceptance criteria |
|---|---|---|---|---|
| C0-01 | Convert repository quality checks into a full CI quality gate. | Codex | None | Push/PR workflow runs lint, typecheck, build, all tests, and preserves existing Shopify integration coverage. |
| C0-02 | Create repository labels, milestones, issue template, and agent handoff rules. | Manus Agent | None | Planning metadata exists in GitHub; every planned task is issue-addressable and owner-ready. |
| C0-03 | Define a release evidence register and implementation decision log. | SOL 5.6 | C0-02 | Documentation explains where to record test, staging, security, and founder-UAT evidence. |

### Chapter 1 — Approval Control Plane

| ID | Task | Owner | Dependencies | Acceptance criteria |
|---|---|---|---|---|
| C1-01 | Introduce authentication and founder-role authorization boundaries. | Codex | C0-01 | All approval and operational endpoints reject anonymous/unauthorized requests; server-side role tests pass. |
| C1-02 | Add approval query/list repository contract and indexed Supabase implementation. | Codex | C1-01 | Filtered, paginated approval queries return durable records without raw protected payloads. |
| C1-03 | Build protected approval list/detail APIs. | Codex | C1-01, C1-02 | API validates query input, returns safe response models, and logs access safely. |
| C1-04 | Build protected approve/reject decision APIs with optimistic concurrency. | Codex | C1-01, C1-02 | A pending approval can be decided once; stale/consumed/expired decisions return deterministic errors and audit events. |
| C1-05 | Create explicit capability and risk policy registry. | Manus Agent | C1-01 | Every enabled tool/action has owner, capability class, risk level, approval rule, and external-effect classification. |
| C1-06 | Threat-model the approval workflow and add security regression tests. | Codex | C1-03, C1-04, C1-05 | Covers replay, cross-tenant access, mismatched target/payload, expired state, CSRF/session protections, and log redaction. |

### Chapter 2 — Founder Operations Surface

| ID | Task | Owner | Dependencies | Acceptance criteria |
|---|---|---|---|---|
| C2-01 | Implement an accessible persisted approvals queue and detail view. | SOL 5.6 | C1-03 | Shows status, action, target, human-safe change summary, expiry, decision history, and no secret/raw payload leakage. |
| C2-02 | Implement guarded approve/reject interaction with confirmation and state refresh. | SOL 5.6 | C1-04, C2-01 | Founder confirms intent; UI handles stale/conflict states; no decision succeeds without protected API response. |
| C2-03 | Build persisted operations dashboard views for runs, routes, tool calls, and audit events. | SOL 5.6 | C1-02 | Filters, loading/error/empty states, correlation links, and responsive/accessibility coverage are complete. |
| C2-04 | Add interface acceptance tests and founder workflow script. | SOL 5.6 | C2-01, C2-02, C2-03 | Test script covers a read operation, draft, approval, blocked replay, failed tool, and audit inspection. |

### Chapter 3 — Governed Integration Fabric

| ID | Task | Owner | Dependencies | Acceptance criteria |
|---|---|---|---|---|
| C3-01 | Complete Shopify production adapter boundaries and test-store contract suite. | Manus Agent | C1-05 | Reads, drafts, and approved mutations are capability-gated; API failures/rate limits are normalized and audited. |
| C3-02 | Implement Gmail read/draft adapter with no-send default and protected send capability. | Manus Agent | C1-05 | OAuth/config validation, thread-safe draft behavior, send approval policy, tests, and audit records are present. |
| C3-03 | Implement Calendar read/prepare adapter with approval-gated event mutation. | Manus Agent | C1-05 | Safe timezone handling, idempotency, external failure tests, and audit records are present. |
| C3-04 | Implement web-search and image-audit adapters with provenance and safe data handling. | Manus Agent | C1-05 | Results show source/provenance; untrusted content cannot alter policy or execute tools. |
| C3-05 | Route product scan, trend radar, inbox triage, and daily audit jobs through the common tool contract. | Manus Agent | C3-01–C3-04 as applicable | No job calls an external adapter directly; every execution gets run/routing/tool/audit records. |

### Chapter 4 — Scheduling and Observability

| ID | Task | Owner | Dependencies | Acceptance criteria |
|---|---|---|---|---|
| C4-01 | Select and implement the production scheduler/queue adapter. | Manus Agent | C3-05 | Scheduled jobs have idempotency keys, retry taxonomy, concurrency policy, and durable run records. |
| C4-02 | Add job-trigger endpoints and failure/retry operational controls. | Codex | C4-01 | Manual trigger is role-protected; duplicate delivery is harmless; failed runs expose retryability without exposing secrets. |
| C4-03 | Expand structured observability with correlation, metrics, and alert policy. | Manus Agent | C4-01 | Correlation ID connects request/run/tool/audit records; documented alerts identify failed jobs, provider timeouts, and persistence errors. |
| C4-04 | Surface job health and operational alerts in the dashboard. | SOL 5.6 | C2-03, C4-03 | Operator sees latest success, failure reason class, retry state, and recommended action. |

### Chapter 5 — Deployment Readiness and Launch

| ID | Task | Owner | Dependencies | Acceptance criteria |
|---|---|---|---|---|
| C5-01 | Build a production migration runner and Supabase verification command. | Manus Agent | C1-02, C4-01 | Fresh and upgrade paths validate schema, indexes, constraints, and rollback preconditions. |
| C5-02 | Create environment validation, secret-management, and deployment configuration checks. | Codex | C5-01 | Startup/deploy fails safely on missing or malformed required settings; no secrets are logged. |
| C5-03 | Complete CI/CD release gate, dependency policy, and artifact checks. | Codex | C0-01, C5-02 | Required status checks enforce quality gate; release artifact and migration evidence are retained. |
| C5-04 | Perform staging migration rehearsal, integration soak, and founder UAT. | SOL 5.6 | C2-04, C3-05, C4-04, C5-01–C5-03 | Evidence register has passing staging results, known limitations, and founder sign-off. |
| C5-05 | Write deployment, rollback, incident, and operations handover runbooks. | Manus Agent | C5-04 | A qualified operator can deploy, verify, disable mutations, roll back, and triage an incident without tribal knowledge. |
| C5-06 | Execute release go/no-go review and controlled production deployment. | Manus Agent | All Chapter 5 tasks | Founder gives explicit go; post-deploy verification and rollback decision window are documented. |

## 6. Critical Path and Parallelization Rules

The critical path is **C0-01 → C1-01 → C1-02 → C1-03/C1-04 → C2-01/C2-02 → C2-04 → C5-04 → C5-06**. C3 integration work can proceed after C1-05. C4 starts once governed job routing in C3-05 is accepted. No task may mark a product interface operational while its governing server-side API is missing.

| Parallel lane | Start condition | Agent allocation | Coordination point |
|---|---|---|---|
| Approval API lane | C0-01 accepted | Codex | Contracts reviewed by Manus Agent before UI starts. |
| UI lane | C1-03 contract stable | SOL 5.6 | Mock only from an approved contract; replace with real API before merge. |
| Integration lane | C1-05 policy registry accepted | Manus Agent | Codex reviews policy enforcement and regression tests. |
| Operations lane | C3-05 accepted | Manus + SOL 5.6 | Dashboard API shapes reviewed before UI implementation. |
| Release lane | Chapters 1–4 accepted | All agents | Founder go/no-go remains a human decision. |

## 7. Required Evidence for Every Pull Request

Every pull request must include a completed version of this table. Missing evidence is a blocking review comment.

| Requirement | Evidence |
|---|---|
| Linked issue | `Closes #<issue>` and the task ID in title/body. |
| Scope | Files/contracts changed and explicit out-of-scope statement. |
| TDD evidence | Failing test command and passing test command. |
| Quality gate | `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test` output. |
| Safety impact | Data classification, policy change, approval/risk effects, and audit impact. |
| Migration impact | Forward/rollback migration, upgrade path, and rehearsal instructions, if applicable. |
| External effects | Test/sandbox proof, rate-limit behavior, idempotency, and failure handling. |
| UX impact | Screenshot or walkthrough plus accessibility/empty/error state coverage, when user-facing. |

## 8. Project Governance

| Decision type | Decision owner | Required reviewers |
|---|---|---|
| Production deployment, real mutation enablement, pricing, deletion, or email send enablement | Founder | Manus Agent and Codex |
| Approval/risk policy change | Manus Agent | Codex; SOL 5.6 if user-facing |
| Database migration or persistence contract change | Manus Agent | Codex |
| API contract or authentication change | Codex | Manus Agent; SOL 5.6 if user-facing |
| Founder UI workflow or accessibility change | SOL 5.6 | Codex for authorization boundary |
| Release evidence and go/no-go package | Manus Agent | Codex and SOL 5.6 |

## 9. Release Checklist

Before C5-06 may start, all answers below must be `Yes` with linked evidence.

1. Are all enabled external mutation tools registered in the capability policy and approval-gated where required?
2. Are approval list/detail/decision endpoints authenticated, authorized, audited, rate-limited, and covered by abuse tests?
3. Are all database migrations applied and rehearsed on a production-like copy or staging project?
4. Do fresh install and upgrade deployment paths pass automated verification?
5. Does the dashboard show durable operational state and correctly handle empty, loading, error, expired, consumed, and conflict cases?
6. Are scheduled jobs idempotent, retry-safe, observable, and controllable?
7. Do CI required checks run lint, typecheck, build, unit/integration tests, and secret/dependency checks?
8. Has staging completed a defined soak period with no unresolved critical or high-severity defects?
9. Are monitoring alerts, runbooks, rollback, and mutation-disable procedures tested?
10. Has the founder explicitly approved the production deployment window and post-deploy verification plan?

## 10. Source of Truth and Update Cadence

This document is the architectural roadmap. GitHub milestones and issues are the work queue. `docs/AGENT_WORK_ORDERS.md` is the detailed execution instruction. `docs/DELIVERY_CALENDAR.md` is the target schedule. If they conflict, update the blueprint and the affected issue in the same pull request, explaining the decision in the repository decision log.

The owner of each active issue posts a concise update every working day: **status, evidence, blockers, next action, and changed target date**. The three agents hold an integration checkpoint at the end of each chapter; no chapter is considered complete merely because its issues are closed.
