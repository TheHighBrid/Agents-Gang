# Agents-Gang Work Orders and Handoff Manual

This manual translates the master blueprint into executable instructions for **Manus Agent**, **Codex**, and **SOL 5.6**. It is intentionally specific: each agent should be able to select an issue, make a bounded change, prove it, and hand it off without guessing about authority or acceptance criteria.

## 1. Universal Start Procedure

Before claiming an issue, every agent must complete this sequence.

1. Pull the current default branch and read `docs/OPERATING_BLUEPRINT.md`, this file, the GitHub issue, and any linked decisions.
2. Confirm the issue’s dependencies are closed or explicitly released by the milestone owner.
3. Post a claim comment in the issue: `Owner`, `branch`, `planned test-first behavior`, and `expected handoff reviewer`.
4. Create an isolated branch named `agent/<issue-number>-<short-name>`.
5. Identify the smallest behavior change. Write or update the test first and run it to observe the expected failure.
6. Implement only the accepted issue scope. Do not change risk levels, approval policy, database schema, or deployment configuration without recording the impact in the pull request.
7. Run the full quality gate before requesting review:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

8. Open a pull request with `Closes #<issue>`, the validation output, evidence links, and the required handoff checklist.

> **Stop conditions.** Stop and request direction instead of improvising when authentication, production credentials, database migration behavior, external-tool permissions, founder policy, or an unclear dependency blocks correct implementation.

## 2. Manus Agent Work Order

### Mission

Manus Agent owns integration integrity, operational safety, migration/release readiness, and cross-cutting architecture. Manus Agent is the default owner for tasks that change external-system boundaries or production operability.

### Initial queue

| Priority | Task IDs | Immediate objective | First files/areas to inspect |
|---|---|---|---|
| P0 | C0-02 | Establish milestones, labels, issue workflow, and planning references. | `.github/`, `docs/`, GitHub labels/milestones/issues. |
| P0 | C1-05 | Create a single authoritative capability/risk policy registry. | `lib/execution/`, `tools/`, `jobs/`, `README.md`. |
| P1 | C3-01 | Complete Shopify adapter boundary and test-store contract suite. | `tools/shopify*.ts`, tests, `.env.example`. |
| P1 | C3-02–C3-04 | Add Gmail, Calendar, image-audit, and web-search integration boundaries. | `tools/gmail.ts`, `tools/calendar.ts`, `tools/imageAudit.ts`, `tools/webSearch.ts`. |
| P1 | C3-05 / C4-01 / C4-03 | Govern jobs, scheduling, and operational telemetry. | `jobs/`, `lib/execution/`, `lib/observability/`. |
| P0 release | C5-01 / C5-05 / C5-06 | Rehearse migration, write runbooks, coordinate go/no-go. | `db/`, CI, deployment docs, staging evidence register. |

### Detailed execution rules

**For policy work (C1-05):** define an explicit typed registry that maps every tool/action to its capability, risk level, approval requirement, target resolver, external-effect classification, idempotency requirement, and owning agent. Ensure the runner uses the registry rather than duplicated literals. Add tests that fail when an enabled tool lacks a policy entry. Update the policy matrix in documentation.

**For external adapters (C3-01–C3-04):** keep adapters narrow and dependency-injected. Configuration must fail closed. Normalize transport, timeout, rate-limit, malformed-response, and authentication failures into safe errors. Never put credentials in client code or logs. Every effectful adapter must flow through `executeTool` and preserve its approval, payload digest, consumption, tool-call, and audit semantics. Use test accounts/sandboxes; do not issue real mutations during development.

**For jobs and scheduler work (C3-05/C4):** require an idempotency key derived from the trigger and intended effect, explicit concurrency behavior, durable run state, and a retry classification. A re-delivered schedule must not double-send, double-publish, or double-change inventory. Persist correlation IDs through request, agent run, tool call, audit event, and structured log layers.

**For migrations and release (C5):** every schema change needs a forward migration, rollback migration, fresh-schema alignment, an upgrade rehearsal, and a documented irreversible-data decision. Deployment automation must run a non-destructive verification before changing production. Runbooks must include disabling mutations, safe rollback, and founder escalation.

### Manus Agent handoff checklist

- [ ] Issue acceptance criteria are checked with links to evidence.
- [ ] External integration tests use a test fixture, fake transport, or documented sandbox.
- [ ] All new mutations are capability-registered and approval-gated.
- [ ] Migration paths and recovery conditions are documented where relevant.
- [ ] Codex reviewed safety/persistence contracts; SOL 5.6 reviewed any operator-facing behavior.

## 3. Codex Work Order

### Mission

Codex owns durable contracts, authentication/authorization correctness, test quality, CI rigor, and independent technical review. Codex prevents the system from merely looking complete while still permitting unauthorized or unverified behavior.

### Initial queue

| Priority | Task IDs | Immediate objective | First files/areas to inspect |
|---|---|---|---|
| P0 | C0-01 | Enforce a full quality gate in GitHub Actions. | `.github/workflows/`, `package.json`, test suite. |
| P0 | C1-01 | Add authenticated founder-role authorization. | `app/api/`, `lib/`, environment docs, Next.js server boundary. |
| P0 | C1-02–C1-04 | Build approval query/list/decision contracts and protected endpoints. | `lib/execution/repository.ts`, `supabase-repository.ts`, `app/api/`. |
| P0 | C1-06 | Threat-model approval control plane and write abuse regression tests. | API tests, runner tests, structured logger. |
| P1 | C4-02 | Secure job-trigger/retry controls. | `app/api/`, `jobs/`, repository contracts. |
| P0 release | C5-02 / C5-03 | Validate configuration and enforce release gates. | `.env.example`, factory files, workflows, deployment docs. |

### Detailed execution rules

**For authentication (C1-01):** select an approach compatible with the deployment target and document it before coding. The server must resolve identity from a trusted mechanism, not client-supplied headers. Implement role checks in the route/service layer and deny by default. All relevant endpoints need tests for anonymous, authenticated non-founder, founder, malformed session, and revoked/expired session cases.

**For repository/API work (C1-02–C1-04):** define safe response DTOs. The approvals list must be paginated, filterable by status/action/date, ordered deterministically, and free of secrets or unsafe raw payloads. Decisions must be compare-and-set updates against `pending` state; stale, expired, consumed, or rejected records must be deterministic failures. Record an audit event for each decision attempt and use server timestamps.

**For security tests (C1-06):** cover bypass attempts rather than only happy paths: another user’s approval ID, mismatched action/target/payload, duplicate decision, decision-after-expiry, replay after consumption, malformed request, unexpected status, and error serialization. Check logs and API output never reveal secret environment variables, tokens, or full protected payloads.

**For CI/CD (C0-01/C5-03):** start with repeatable quality checks before adding automation complexity. Required checks should include lint, typecheck, build, all unit/integration tests, and a secret/dependency policy. Make failures easy to diagnose, cache dependencies, and ensure workflow permissions follow least privilege.

### Codex review protocol

Codex must review, or explicitly delegate review of, every pull request that changes: authentication, risk/capability policy, approval status flow, tool execution, migration, external mutation, logging/redaction, CI secret handling, or deployment rules. Review comments should identify the exact security or correctness consequence and request a regression test when behavior changes.

### Codex handoff checklist

- [ ] Red test and green test evidence are present.
- [ ] Authorization and error paths are tested, not just success.
- [ ] Types, API schemas, repository interfaces, and migrations agree.
- [ ] The full quality gate output is attached.
- [ ] Manus Agent reviewed external/deployment implications; SOL 5.6 reviewed user-facing contract impact.

## 4. SOL 5.6 Work Order

### Mission

SOL 5.6 owns the founder’s usable operational experience: approval review, dashboard comprehension, accessibility, test data, acceptance scripts, and the clarity of the handoff from technical state to human action.

### Initial queue

| Priority | Task IDs | Immediate objective | First files/areas to inspect |
|---|---|---|---|
| P0 | C0-03 | Create the evidence register and decision-log conventions. | `docs/`, GitHub issue templates, milestone evidence needs. |
| P0 | C2-01 | Replace approval placeholder page with persisted, safe queue/detail UI. | `app/approvals/page.tsx`, approval API contract, global styles. |
| P0 | C2-02 | Build guarded approve/reject flow with conflict handling. | Approval UI and decision endpoint contract. |
| P1 | C2-03 / C2-04 | Build operational dashboard and founder acceptance coverage. | `app/dashboard/page.tsx`, dashboard API/view models. |
| P1 | C4-04 | Surface job health, retry state, and operator actions. | Dashboard views, observability response models. |
| P0 release | C5-04 | Lead staging UAT evidence and founder workflow demonstration. | Acceptance scripts, seeded data, release evidence register. |

### Detailed execution rules

**For approvals UI (C2-01/C2-02):** the screen must distinguish pending, approved, rejected, expired, and consumed states. It must display a safe, human-readable action summary, target, requesting agent, requested/expiry timestamps, and decision result. Do not display secrets, credentials, raw tool arguments, or hidden system prompts. A destructive/high-impact action requires an explicit confirmation that repeats the human-readable action and target. If the server reports a conflict or stale state, the UI refreshes and explains that no decision was made.

**For dashboard (C2-03/C4-04):** prioritize operational triage over decoration. A founder should locate failed runs, pending approvals, high-risk blocks, and job failures within one interaction. Include loading, empty, error, and permission-denied states. Every displayed status must come from a server response, not a local assumption. Link correlated records by run ID where safe.

**For acceptance testing (C2-04/C5-04):** write a founder-readable script that exercises the entire governance story: submit request, inspect routing, prepare mutation, approve/reject, observe execution, attempt replay, inspect audit, handle external failure, and review scheduled job health. Use fake/sandbox data. Record screenshots or equivalent evidence in the release register.

**For accessibility:** preserve semantic headings, labels, focus management in confirmations/modals, keyboard operation, meaningful error messages, color-independent status cues, and responsive layouts. Include accessibility acceptance checks in each UI issue.

### SOL 5.6 handoff checklist

- [ ] User stories and acceptance cases are fulfilled with screenshots/walkthrough evidence.
- [ ] Loading, empty, error, conflict, expired, and consumed states are covered.
- [ ] Server-side authorization remains authoritative; the UI has no bypass behavior.
- [ ] Accessibility checks and responsive behavior are documented.
- [ ] Codex reviewed API/authorization use; Manus Agent reviewed operational/release impact.

## 5. Cross-Agent Integration Checkpoints

| Checkpoint | Required participants | Required outputs |
|---|---|---|
| **API contract freeze** before C2-01 | Codex, SOL 5.6, Manus Agent | Versioned request/response examples, state diagram, authorization rules, error taxonomy. |
| **Integration policy review** before C3 adapters | Manus Agent, Codex | Capability matrix, external-effect inventory, sandbox strategy, idempotency rules. |
| **Operational telemetry review** before C4 dashboard | Manus Agent, SOL 5.6, Codex | Correlation model, dashboard view models, alert thresholds, runbook owner. |
| **Release readiness review** before C5-04 | All agents | Green evidence register, migration rehearsal, staging report, unresolved-risk list, rollback plan. |
| **Go/no-go review** before C5-06 | Founder, all agents | Explicit founder decision, launch window, mutation-enable plan, post-deploy test plan, escalation contacts. |

## 6. Pull Request Template

Copy this structure into every pull request description.

```markdown
## Linked work
Closes #<issue-number> — <task ID>

## Objective and scope
- Objective:
- Changed files/contracts:
- Explicitly out of scope:

## Safety and data impact
- Authentication/authorization impact:
- Approval/risk/payload/consumption impact:
- External effects and idempotency:
- Sensitive data/logging impact:
- Migration/rollback impact:

## Test-first evidence
- Red: `<command>` — <expected failure>
- Green: `<command>` — <pass summary>

## Full validation
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test`

## Handoff
- Required reviewers:
- Screenshots/demo or sandbox evidence:
- Follow-up issues or risks:
```

## 7. Issue Status Language

Use the following exact language in issue comments to reduce ambiguity:

| State | Required comment |
|---|---|
| Claimed | `Owner: <agent>. Branch: <branch>. First red test: <behavior>. Reviewer: <agent>.` |
| Blocked | `Blocked by: #<issue or condition>. Impact: <what cannot proceed>. Needed decision: <specific choice>.` |
| Ready for review | `Ready for review. Evidence: <commands/links>. Risks checked: <list>.` |
| Accepted | `Accepted after merge <SHA>. Verification: <commands/results>.` |
| Deferred | `Deferred to milestone <name> because <reason>. No hidden implementation remains on this branch.` |

The owner must update the issue, work tracker, and release evidence register when an accepted change affects dependencies, delivery date, policy, or deployment risk.
