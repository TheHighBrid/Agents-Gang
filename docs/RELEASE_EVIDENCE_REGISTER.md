# Agents-Gang Release Evidence Register

This register is the durable, founder-readable index for proving that Agents-Gang is safe and ready to release. It records where evidence belongs, who owns it, what has actually been verified, and what remains planned. It must never be used to imply that planned work has passed.

Related governance: [Operational Completion Blueprint](./OPERATING_BLUEPRINT.md), [Task Tracker](./TASK_TRACKER.md), [Agent Work Orders](./AGENT_WORK_ORDERS.md), and [Decision Log](./DECISION_LOG.md).

## Evidence status vocabulary

Use exactly one of these statuses for every evidence record:

- `Planned`: evidence is required but has not yet been produced.
- `In progress`: execution has started, but the acceptance proof is incomplete.
- `Blocked`: evidence cannot be produced until a named blocker or decision is resolved.
- `Verified`: the stated requirement was executed and the linked artifact proves the result.
- `Failed`: verification was executed and did not satisfy the requirement.
- `Accepted exception`: the founder or authorized decision owner explicitly accepted a known gap, with a linked decision-log entry.
- `Superseded`: newer evidence replaces this record and the replacement is linked.

A record is `Verified` only when its **Evidence location** contains an inspectable artifact such as a pull request, commit, CI run, test output, screenshot, staging record, migration report, or signed decision. A plan, checklist, issue description, or verbal claim is not verification.

### Evidence handling rules

1. Never paste credentials, tokens, protected payloads, raw customer data, private prompts, or secrets into this register.
2. Prefer durable GitHub links to PRs, commits, workflow runs, issues, and repository documents.
3. Every evidence item names an owner, date, scope, result, and source.
4. Failed or superseded evidence stays visible for auditability.
5. Founder sign-off and accepted exceptions must link to `docs/DECISION_LOG.md`.
6. Release readiness is determined from verified evidence, not issue closure alone.

## Evidence ID convention

Use `EV-<TASK-ID>-<NN>` for task evidence, for example `EV-C1-04-01`. Use `RC-01` through `RC-10` for the ten release-checklist gates defined in the blueprint.

## Release checklist evidence

| Gate | Release requirement | Primary task sources | Required proof | Status | Evidence location |
|---|---|---|---|---|---|
| RC-01 | Enabled external mutation tools are capability-registered and approval-gated where required. | C1-05, C3-01 to C3-05 | Policy registry completeness test, mutation approval tests, integration review. | Planned | Add accepted C1/C3 policy and integration evidence. |
| RC-02 | Approval list/detail/decision endpoints are authenticated, authorized, audited, rate-limited, and abuse-tested. | C1-01, C1-03, C1-04, C1-06 | Authorization matrix, abuse regressions, audit proof, rate-limit evidence. | Planned | Add accepted control-plane and security evidence. |
| RC-03 | Database migrations are applied and rehearsed in a production-like environment. | C5-01 | Fresh/upgrade rehearsal report with schema, index, constraint, and rollback precondition checks. | In progress | `EV-C5-01-01` verifies disposable PostgreSQL fresh/upgrade behavior. Production-like staging application remains C5-04 evidence. |
| RC-04 | Fresh-install and upgrade deployment paths pass automated verification. | C5-01, C5-03 | Automated verification output for both paths and retained release artifact evidence. | In progress | `EV-C5-01-01` and `EV-C5-03-01` prove automated paths and PR artifact retention. A post-merge `main` manifest with `releaseEligible=true` is still required. |
| RC-05 | Dashboard shows durable operational state and handles empty, loading, error, expired, consumed, and conflict cases. | C2-01, C2-02, C2-03, C2-04 | UI/API acceptance tests, accessibility checks, screenshots or walkthrough. | Planned | C2-04 automated/operator contract: `docs/FOUNDER_WORKFLOW_ACCEPTANCE.md` and `EV-C2-04-01`. Staging screenshots/walkthrough remain C5-04 evidence. |
| RC-06 | Scheduled jobs are idempotent, retry-safe, observable, and controllable. | C3-05, C4-01, C4-02, C4-03, C4-04 | Duplicate-delivery tests, retry taxonomy, correlation proof, operator controls, job-health view. | In progress | Chapter 4 implementation is merged; chapter-level release evidence still needs final independent acceptance linkage. |
| RC-07 | CI required checks cover lint, typecheck, build, tests, secret checks, and dependency checks. | C0-01, C5-03 | Required workflow runs and branch-protection/release-gate evidence. | Blocked | `EV-C5-03-01` verifies the in-repo gate. `EV-C5-03-02` remains blocked until the GitHub `main` ruleset and promotable `main` manifest are verified. |
| RC-08 | Staging completes the defined soak with no unresolved critical/high defects. | C5-04 | Completed staging soak record, defect register, and disposition of all critical/high findings. | Planned | C5-04 staging soak evidence. |
| RC-09 | Monitoring alerts, runbooks, rollback, and mutation-disable procedures are tested. | C4-03, C5-05 | Alert exercise, rollback rehearsal, mutation-disable rehearsal, operator runbook review. | Planned | C5-05 rehearsal evidence. |
| RC-10 | Founder explicitly approves the deployment window and post-deploy verification plan. | C5-04, C5-06 | Founder UAT result plus explicit go/no-go decision-log entry. | Planned | C5-04 founder UAT and C5-06 decision-log evidence. |

## Task evidence records

### EV-C2-04-01 - Founder workflow acceptance suite
- Status: In progress
- Evidence owner: SOL 5.6
- Verification date/time (UTC): 2026-08-18
- Scope: Deterministic sandbox acceptance for read, governed draft/high-risk preparation, approve/reject, one-time consumption and replay block, injected external failure, safe dashboard/audit inspection, and founder-session authorization behavior.
- Automated evidence: `tests/founder-workflow-acceptance.test.ts`.
- Operator evidence contract: `docs/FOUNDER_WORKFLOW_ACCEPTANCE.md`.
- Red evidence: PR #57 quality-gate run `32089456701` passed install, lint, typecheck, and build; the new documentation/evidence contract initially failed before the operator document existed.
- External-effect safety: fixture-only in-memory execution; no network call, production credential, customer data, or real mutation.
- Authorization safety: automated coverage rejects a client-supplied founder role and accepts only a signed founder session.
- Remaining proof: staging screenshots/walkthrough and release-level independent acceptance remain C5-04 evidence.
- Evidence location(s): Issue #22, PR #57, `tests/founder-workflow-acceptance.test.ts`, `docs/FOUNDER_WORKFLOW_ACCEPTANCE.md`.

### EV-C5-01-01 - Migration runner and disposable PostgreSQL rehearsal
- Status: Verified
- Evidence owner: Manus Agent / implementation reviewed through exact-head CI
- Verification date/time (UTC): 2026-08-18
- Scope verified: reproducible fresh bundle, explicit known-baseline upgrade bundle, schema verification, seeded-data preservation, mismatched-baseline fail-closed behavior, and migration atomicity hardening.
- Automated evidence: Migration rehearsal workflow on the accepted C5-01 branch and subsequent exact-head C5-02/C5-03 runs.
- Safety boundary: the rehearsal used disposable PostgreSQL. This record does not claim that production or a production-like Supabase staging target has been migrated.
- Rollback note: approval-consumption rollback is documented as semantically lossy because consumed approvals become expired.
- Evidence location(s): Issue #32, merged C5-01 implementation at `54c73cca4a98e09596da8ef26d2f13cb428cfa6e`, `.github/workflows/migration-rehearsal.yml`, `scripts/db-migrate.mjs`.

### EV-C5-02-01 - Managed environment validation and feature isolation
- Status: Verified
- Evidence owner: Codex
- Verification date/time (UTC): 2026-08-18
- Scope verified: staging/production startup validation, explicit optional feature flags, fail-closed enabled integrations, stale-credential disable enforcement, and redacted diagnostics.
- Exact-head evidence before merge: Quality, Environment validation, and Migration rehearsal workflows all passed after the source-contract correction.
- Safety boundary: validation output identifies configuration keys/reasons without printing configured secret values.
- Evidence location(s): Issue #33, PR #64, merge `65b10ef73dbd856ae28cd001b8c8b396e50c650a`, `tests/environment-validation.test.ts`, `tests/feature-disable-boundaries.test.ts`.

### EV-C5-03-01 - In-repository release gate and supply-chain enforcement
- Status: Verified
- Evidence owner: Codex
- Verification date/time (UTC): 2026-08-18
- Scope verified: independent release-candidate workflow, repository quality, environment policy, fresh/upgrade migration proof, package-lock reconciliation, `npm audit --audit-level=high`, tracked-file secret scanning, immutable GitHub Action SHA pins, Dependabot policy, and provenance manifest generation.
- Exact-head branch: `6da35175e227c773d067d52824628a45d52d7bb2`.
- Exact-head Quality run: `32137947378` - green.
- Exact-head Environment validation run: `32137947374` - green.
- Exact-head Migration rehearsal run: `32137947407` - green.
- Exact-head Release gate run: `32137947570` - all six prerequisite jobs plus `Release provenance manifest` green.
- PR artifact: `release-gate-evidence-32137947570`, artifact id `9324733543`, digest `sha256:041b4950c6f35c488357ef7244748c5d4dc529a2778551ed661754a444f5631d`, retained through 2026-11-16.
- Manifest safety result: PR evidence was correctly `releaseEligible=false`, so a pull-request validation artifact cannot be promoted.
- Merge: PR #65 merged as `03593db6419975c7b89fb4b156377a2df7876870`.
- Evidence location(s): Issue #34, PR #65, `.github/workflows/release-gate.yml`, `docs/RELEASE_GATE_POLICY.md`, `docs/GITHUB_MAIN_PROTECTION.md`.

### EV-C5-03-02 - GitHub platform enforcement and promotable main evidence
- Status: Blocked
- Evidence owner: Repository administrator / C5-03 owner
- Verification date/time (UTC): pending
- Required proof: an active GitHub `main` ruleset requiring PR flow and the actual `Release provenance manifest` check, with force pushes and branch deletion blocked and no routine broad bypass.
- Required release artifact proof: a push-triggered post-merge `main` Release gate artifact whose manifest has `releaseEligible=true`.
- Current limitation: the connected GitHub action surface can inspect repository content, PR workflows, jobs, and artifacts, but does not expose repository ruleset mutation/verification or non-PR workflow enumeration needed to prove these controls.
- Operator specification: `docs/GITHUB_MAIN_PROTECTION.md`.
- Consequence: C5-03 stays open/Blocked and C5-04 must not start until this evidence exists or an explicit founder-authorized release exception is recorded.
- Evidence location(s): Issue #34 comments, PR #65 merge, `docs/GITHUB_MAIN_PROTECTION.md`.

## Chapter acceptance index

Use this table as the chapter-level roll-up. Do not mark a chapter `Verified` until its exit gate is proven and the referenced evidence is inspectable.

| Chapter | Exit evidence expected | Status | Evidence location |
|---|---|---|---|
| Chapter 0 - Program Control | Published planning controls plus full CI quality gate. | In progress | Issues #10 to #12 and accepted PR/CI evidence. |
| Chapter 1 - Approval Control Plane | Authenticated/authorized approval APIs, lifecycle enforcement, policy registry, abuse tests. | In progress | Issues #13 to #18 and corresponding PR/CI/security evidence. |
| Chapter 2 - Founder Operations Surface | Persisted approvals/dashboard workflows with accessibility and acceptance proof. | In progress | Issues #19 to #22; C5-04 retains staging walkthrough evidence. |
| Chapter 3 - Governed Integration Fabric | Enabled adapters and jobs governed by the common execution contract. | In progress | Issues #23 to #27; C3-03/C3-04 remain optional/open integration work. |
| Chapter 4 - Scheduling and Observability | Durable scheduler, retry/idempotency, correlation, alerts, job-health UX. | In progress | Issues #28 to #31 are implementation-complete; release-level independent acceptance linkage remains. |
| Chapter 5 - Deployment Readiness and Launch | Migration, environment, release gate, staging, runbooks, explicit go/no-go. | Blocked | `EV-C5-01-01`, `EV-C5-02-01`, `EV-C5-03-01`; blocked by `EV-C5-03-02` before C5-04. |

## Chapter acceptance template

Copy this section for each chapter acceptance decision.

```markdown
### EV-<TASK-ID>-<NN> - Chapter <N> acceptance
- Status: Planned | In progress | Blocked | Verified | Failed | Accepted exception | Superseded
- Evidence owner:
- Verification date/time (UTC):
- Chapter exit gate:
- Included task IDs:
- Test/CI evidence:
- Security/policy evidence:
- UX/operator evidence, if applicable:
- Migration/external-effect evidence, if applicable:
- Known limitations or unresolved risks:
- Independent reviewer:
- Evidence location(s):
- Decision-log entry, if an exception or release decision exists:
```

## Pull-request evidence template

```markdown
### EV-<TASK-ID>-<NN> - Pull request evidence
- Status:
- Task ID / issue:
- Pull request:
- Commit or merge SHA:
- Scope verified:
- Explicitly out of scope:
- Red test command/result:
- Green test command/result:
- Full quality gate: lint / typecheck / build / test
- Safety and data impact:
- Migration/rollback impact:
- External-effect/idempotency impact:
- UX/accessibility evidence, if applicable:
- Reviewer(s):
- Evidence location(s):
```

## Migration rehearsal template

Use only sandbox/staging or an explicitly authorized production-like target. Never include credentials.

```markdown
### EV-<TASK-ID>-<NN> - Migration rehearsal
- Status:
- Environment classification: local | sandbox | staging | production-like
- Schema/migration version:
- Starting state:
- Target state:
- Fresh-install command/result:
- Upgrade command/result:
- Schema/index/constraint verification:
- Failure-path exercised:
- Rollback preconditions checked:
- Data-loss or irreversible-risk notes:
- Operator:
- Reviewer:
- Date/time (UTC):
- Evidence location(s):
```

## Staging soak template

A soak record is not `Verified` until the full planned window completes and critical/high findings are resolved or explicitly accepted.

```markdown
### EV-C5-04-<NN> - Staging soak
- Status:
- Staging environment:
- Soak start/end (UTC):
- Build/commit under test:
- Enabled integrations/capabilities:
- Scheduled jobs exercised:
- Approval/governance flows exercised:
- External failure paths exercised:
- Monitoring/alert behavior observed:
- Critical defects:
- High-severity defects:
- Other known limitations:
- Defect disposition links:
- Reviewer(s):
- Evidence location(s):
```

## Founder UAT template

Founder UAT proves usability and governance behavior. It does not by itself authorize production deployment.

```markdown
### EV-C5-04-<NN> - Founder UAT
- Status:
- Founder/operator:
- Build/commit:
- Date/time (UTC):
- Scenario set executed:
- Read workflow result:
- Draft/prepared-mutation result:
- Approve result:
- Reject result:
- Replay-block result:
- External-failure result:
- Audit inspection result:
- Job-health review result:
- Accessibility/operator friction observed:
- Open defects/limitations:
- Founder acceptance result: accepted | rejected | accepted with conditions
- Evidence location(s):
- Related decision-log entry:
```

## Evidence update procedure

1. Add or update the relevant `EV-*` record and keep the status truthful.
2. Link the source artifact rather than copying sensitive/raw output.
3. Update the related `RC-*` row when the evidence contributes to a release gate.
4. If evidence changes a dependency, delivery date, policy, deployment risk, exception, or go/no-go posture, update the task tracker and decision log as applicable in the same pull request.
5. At chapter close, add a chapter acceptance record and obtain the required independent review.
6. Before C5-06, every `RC-*` row must be `Verified` or an explicitly allowed `Accepted exception` backed by a founder-authorized decision.
