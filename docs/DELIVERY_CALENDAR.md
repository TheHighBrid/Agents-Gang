# Agents-Gang Delivery Calendar

> **Schedule baseline:** Monday, 17 August 2026 through Sunday, 25 October 2026. Dates are target windows, not permission to skip acceptance gates. A milestone slips when its evidence is incomplete; it does not become complete because the calendar date arrives.

## 1. Calendar at a Glance

| Week | Dates | Chapter | Primary outcome | Lead agents | Mandatory gate |
|---|---|---|---|---|---|
| 0 | Aug 17–23 | Program Control | Shared issue/label/milestone workflow, CI baseline, decision/evidence register. | Manus, Codex, SOL 5.6 | Every active work item has an owner, reviewer, and target acceptance evidence. |
| 1 | Aug 24–30 | Approval Control Plane | Authentication design and approval repository query contract. | Codex | API contract and identity model reviewed by all agents. |
| 2 | Aug 31–Sep 6 | Approval Control Plane | Protected approval list/detail APIs and state-safe decisions. | Codex | Abuse and concurrency tests pass; no anonymous decision path exists. |
| 3 | Sep 7–13 | Founder Operations Surface | Persisted approval queue, detail screen, and safe decision experience. | SOL 5.6 | UI consumes protected APIs and handles conflict/expired/consumed states. |
| 4 | Sep 14–20 | Founder Operations Surface / Integration Fabric | Operations dashboard foundation and capability policy registry. | SOL 5.6, Manus | API/data model freeze and capability policy review accepted. |
| 5 | Sep 21–27 | Governed Integration Fabric | Shopify test-store boundary plus Gmail/Calendar adapter foundations. | Manus | Every enabled external mutation has policy, idempotency, and audit test. |
| 6 | Sep 28–Oct 4 | Governed Integration Fabric | Web/image adapters and governed routing for all scheduled jobs. | Manus | Jobs use common execution contract; direct external calls are eliminated. |
| 7 | Oct 5–11 | Scheduling and Observability | Queue/scheduler, retry controls, correlation model, and job health. | Manus, Codex, SOL 5.6 | Duplicate delivery and failure/retry scenarios are proven safe. |
| 8 | Oct 12–18 | Deployment Readiness | Migration runner, env validation, CI/CD release gate, staging rehearsal start. | Manus, Codex | Fresh/upgrade migration rehearsal and required CI checks pass. |
| 9 | Oct 19–25 | Launch | Staging soak, founder UAT, runbooks, go/no-go, controlled deployment. | All agents + founder | Release checklist is complete and founder explicitly approves launch. |

## 2. Current Evidence Checkpoint — 17 August 2026

The following milestone evidence is now present on `main` and has been reflected in the task tracker: C0-01 through C0-03, C1-01 through C1-04, C1-06, C2-01, and C3-05. The corresponding merged delivery evidence is PRs #40, #41, #42, #43, #44, #45, and #46, with the repository quality gate and Shopify integration checks passing on the current delivery branches.

| Workstream | Current status | Evidence or next action |
|---|---|---|
| Program control | Accepted | CI quality gate, planning metadata, release evidence register, and decision-log conventions are merged. |
| Approval control plane | Accepted for implemented scope | Founder boundary, paginated approval contract, protected APIs, state-safe decisions, and threat-model regressions are merged. The capability/risk registry C1-05 remains open and must not be treated as complete. |
| Founder operations surface | C2-01 accepted; C2-02 active | Persisted approval queue/detail UI is merged. PR #48 is the active guarded decision workflow and is awaiting review/verification. |
| Governed integration fabric | C3-05 accepted for currently enabled scheduled audits; C3-01 remains open | Shopify production/test-store boundary and policy evidence remain required. |
| Codex review blocker | Active repair | PR #47’s quality gate failed at TypeScript compilation because `jobs/inboxTriage.ts` referenced `runInboxAlert` without importing it. Repair branch `agent/codex-fix-inbox-alert-typecheck` claims this blocker and will rerun the full quality gate. |

## 3. Week-by-Week Operating Plan

### Week 0 — Program control and baseline discipline

| Day / owner | Required work | Deliverable |
|---|---|---|
| **Mon Aug 17 — Manus Agent** | Publish blueprint, milestones, labels, and issue backlog. Confirm default branch/workflow rules. | GitHub work queue and planning docs. |
| **Tue Aug 18 — Codex** | Upgrade CI from a Shopify-only job to complete quality gate proposal with tests. | C0-01 pull request. |
| **Wed Aug 19 — SOL 5.6** | Create release evidence register and decision-log conventions. Define UI acceptance evidence format. | C0-03 pull request/documentation. |
| **Thu Aug 20 — All agents** | Baseline review: inspect current tests, migrations, env configuration, and operational gaps. | Chapter 0 checkpoint note. |
| **Fri Aug 21 — Codex + Manus** | Merge/verify CI and planning changes; reconcile issue dependencies. | Chapter 0 acceptance evidence. |

**Friday gate:** no Chapter 1 implementation begins unless quality checks are reproducible and agents can identify task ownership, reviewer, and evidence requirements.

### Week 1 — Authentication and durable approval read model

| Owner | Task focus | Completion evidence |
|---|---|---|
| **Codex** | C1-01: select and implement trusted identity/founder role boundary. | Authorization matrix, anonymous/non-founder/founder test coverage, environment docs. |
| **Codex** | C1-02: add safe, paginated approval query repository/model. | Supabase mapping, indexes/migration if needed, pagination/order tests. |
| **Manus Agent** | C1-05: publish capability/risk policy registry design and tool inventory. | Registry proposal, policy matrix, no unclassified enabled tool. |
| **SOL 5.6** | Review API contract needs for C2 and draft approval workflow acceptance cases. | Contract feedback and UI state model. |

**Friday gate:** all agents accept the identity model and approval DTO. SOL 5.6 may start UI only against this agreed contract.

### Week 2 — Protected decisions and threat model

| Owner | Task focus | Completion evidence |
|---|---|---|
| **Codex** | C1-03: protected approval list/detail APIs. | Contract/integration tests and redacted response proof. |
| **Codex** | C1-04: protected approve/reject APIs with compare-and-set semantics. | Duplicate/stale/expired/consumed decision tests and decision audit events. |
| **Codex** | C1-06: approval workflow threat model and abuse regressions. | Reviewed threat model and tests for bypass/replay/cross-identity cases. |
| **Manus Agent** | Support policy registry integration review. | Review comment or accepted policy contract. |

**Friday gate:** no UI decision control is merged until server decision APIs reject unauthenticated, stale, expired, consumed, and unauthorized requests.

### Week 3 — Founder approvals workflow

| Owner | Task focus | Completion evidence |
|---|---|---|
| **SOL 5.6** | C2-01: persisted approvals queue/detail view. | Responsive, accessible screen with all lifecycle states. |
| **SOL 5.6** | C2-02: guarded approve/reject confirmation and refresh. | Conflict/retry/error behavior walkthrough; no local bypass. |
| **Codex** | Review UI API use and add missing authorization tests. | Review sign-off or follow-up fixes. |
| **Manus Agent** | Validate safe summary/content rendering policy. | Security/redaction review. |

**Friday gate:** founder can complete a safe approval workflow in a test environment and observe the decision in durable audit state.

### Week 4 — Operations surface and integration policy freeze

| Owner | Task focus | Completion evidence |
|---|---|---|
| **SOL 5.6** | C2-03/C2-04: operations views and full founder acceptance script. | Run/routing/tool/audit views; test script and evidence template. |
| **Manus Agent** | Finalize C1-05 registry and start C3-01. | Tool policy registry merged; Shopify test-store adapter plan. |
| **Codex** | Contract consistency review across API, repository, and UI. | Open discrepancies resolved or filed as blocking issues. |

**Friday gate:** UI/API contract is frozen for the current milestone; all enabled Shopify actions have policy entries.

### Weeks 5–6 — Governed integration fabric

| Period | Owner | Tasks | Gate |
|---|---|---|---|
| **Sep 21–27** | Manus Agent | C3-01 Shopify, C3-02 Gmail foundation, C3-03 Calendar foundation. | Sandbox/test transports, policy enforcement, normalized errors, audit coverage. |
| **Sep 28–Oct 4** | Manus Agent | C3-04 web/image adapters and C3-05 jobs through common contract. | No direct job-to-adapter calls; all job executions persist governed records. |
| **Both weeks** | Codex | Review and extend adapter abuse/failure tests. | Rate-limit, malformed response, auth failure, idempotency, and approval regressions pass. |
| **Both weeks** | SOL 5.6 | Prepare operator language, dashboard data needs, and scenario walkthroughs. | UX does not expose unsafe raw external data. |

### Week 7 — Scheduling and observability

| Owner | Task focus | Completion evidence |
|---|---|---|
| **Manus Agent** | C4-01 scheduler/queue and C4-03 observability. | Idempotency/retry/correlation/alert tests and documented thresholds. |
| **Codex** | C4-02 protected manual trigger/retry controls. | Permission and duplicate-delivery tests. |
| **SOL 5.6** | C4-04 job-health dashboard. | Operator can identify failure class, retry state, and recommended action. |

**Friday gate:** repeat delivery and failed execution scenarios are visible, safe, and actionable without manual database inspection.

### Week 8 — Deployment readiness

| Owner | Task focus | Completion evidence |
|---|---|---|
| **Manus Agent** | C5-01 migration runner/verification. | Fresh installation and upgrade rehearsal. |
| **Codex** | C5-02 environment validation and C5-03 CI/CD gate. | Fail-closed config tests; required checks and secret/dependency policy. |
| **SOL 5.6** | Prepare C5-04 founder UAT environment and scripts. | Seeded scenarios, evidence capture plan, issue triage procedure. |

**Friday gate:** staging environment can be provisioned/reprovisioned, migrated, and validated from documented steps.

### Week 9 — Staging soak and controlled launch

| Day / owner | Required work | Decision point |
|---|---|---|
| **Mon–Wed Oct 19–21 — All agents** | Execute staging soak and founder UAT. Triage only release-impacting defects immediately; file lower-risk defects. | Soak evidence register updated daily. |
| **Thu Oct 22 — Manus + Codex** | Validate migration/release/rollback evidence and runbooks. | Technical go/no-go recommendation. |
| **Fri Oct 23 — SOL 5.6 + founder** | Conduct founder operational walkthrough. | Founder acceptance or documented blockers. |
| **Sat–Sun Oct 24–25 — Founder + Manus** | Controlled deployment only if all release checklist items are satisfied. | Explicit human go; post-deploy verification and rollback watch window. |

## 4. Recurring Coordination Cadence

| Cadence | Participants | Agenda | Artifact |
|---|---|---|---|
| Daily async update | Task owner + reviewers | Status, evidence, blocker, next action, target date. | GitHub issue comment. |
| Monday planning checkpoint | All agents | Reconfirm critical path, dependencies, and scope changes. | Milestone issue/comment update. |
| Wednesday integration review | Relevant lane owners | API/policy/data contract changes and test evidence. | PR review / decision log. |
| Friday chapter review | All agents | Accept, defer, or block chapter tasks using evidence. | Release evidence register. |
| Release go/no-go | Founder + all agents | Review checklist, unresolved risks, rollback, deployment window. | Signed decision record. |

## 5. Calendar Change Rules

A target date changes only when the issue owner posts the dependency, impact, and new target date. Any slip to the critical path requires a chapter-review decision. New work must be filed as an issue and assigned to a milestone; it may not be hidden inside an unrelated pull request.

The founder retains authority over schedule compression that would trade away approval governance, test coverage, migration rehearsal, security review, or staging evidence.
