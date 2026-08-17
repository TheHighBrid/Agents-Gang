# Agents-Gang Release Evidence Register

This register is the durable, founder-readable index for proving that Agents-Gang is safe and ready to release. It records **where evidence belongs**, **who owns it**, **what has actually been verified**, and **what remains planned**. It must never be used to imply that planned work has passed.

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

All rows are intentionally seeded as `Planned`. Replace `Planned` only after the required evidence exists. Each row is the canonical evidence location for its corresponding release-checklist question.

| Gate | Release requirement | Primary task sources | Required proof | Status | Evidence location |
|---|---|---|---|---|---|
| RC-01 | Enabled external mutation tools are capability-registered and approval-gated where required. | C1-05, C3-01 to C3-05 | Policy registry completeness test, mutation approval tests, integration review. | Planned | Add links in this row to accepted C1-05/C3 evidence and related PR/CI runs. |
| RC-02 | Approval list/detail/decision endpoints are authenticated, authorized, audited, rate-limited, and abuse-tested. | C1-01, C1-03, C1-04, C1-06 | Authorization matrix, abuse regressions, audit proof, rate-limit evidence. | Planned | Add links in this row to accepted C1 control-plane evidence and security review. |
| RC-03 | Database migrations are applied and rehearsed in a production-like environment. | C5-01 | Fresh/upgrade rehearsal report with schema, index, constraint, and rollback precondition checks. | Planned | Add the completed Migration rehearsal record and staging run links here. |
| RC-04 | Fresh-install and upgrade deployment paths pass automated verification. | C5-01, C5-03 | Automated verification output for both paths and retained release artifact evidence. | Planned | Add migration verification and release workflow links here. |
| RC-05 | Dashboard shows durable operational state and handles empty, loading, error, expired, consumed, and conflict cases. | C2-01, C2-02, C2-03 | UI/API acceptance tests, accessibility checks, screenshots or walkthrough. | Planned | Add accepted Chapter 2 evidence and founder workflow artifacts here. |
| RC-06 | Scheduled jobs are idempotent, retry-safe, observable, and controllable. | C3-05, C4-01, C4-02, C4-03, C4-04 | Duplicate-delivery tests, retry taxonomy, correlation proof, operator controls, job-health view. | Planned | Add accepted Chapter 4 scheduler/observability evidence here. |
| RC-07 | CI required checks cover lint, typecheck, build, tests, secret checks, and dependency checks. | C0-01, C5-03 | Required workflow runs and branch-protection/release-gate evidence. | Planned | Add CI workflow run and release-gate links here. |
| RC-08 | Staging completes the defined soak with no unresolved critical/high defects. | C5-04 | Completed Staging soak record, defect register, and disposition of all critical/high findings. | Planned | Add the completed staging soak record and linked defect evidence here. |
| RC-09 | Monitoring alerts, runbooks, rollback, and mutation-disable procedures are tested. | C4-03, C5-05 | Alert exercise, rollback rehearsal, mutation-disable rehearsal, operator runbook review. | Planned | Add rehearsal output and accepted runbook links here. |
| RC-10 | Founder explicitly approves the deployment window and post-deploy verification plan. | C5-04, C5-06 | Founder UAT result plus explicit go/no-go decision-log entry. | Planned | Add the completed Founder UAT record and decision-log entry here. |

## Chapter acceptance index

Use this table as the chapter-level roll-up. Do not mark a chapter `Verified` until its exit gate is proven and the referenced evidence is inspectable.

| Chapter | Exit evidence expected | Status | Evidence location |
|---|---|---|---|
| Chapter 0 - Program Control | Published planning controls plus full CI quality gate. | In progress | Issues #10 to #12 and their accepted PR/CI evidence. |
| Chapter 1 - Approval Control Plane | Authenticated/authorized approval APIs, lifecycle enforcement, policy registry, abuse tests. | Planned | Issues #13 to #18 and corresponding PR/CI/security evidence. |
| Chapter 2 - Founder Operations Surface | Persisted approvals/dashboard workflows with accessibility and acceptance proof. | Planned | Issues #19 to #22 and corresponding UI/API evidence. |
| Chapter 3 - Governed Integration Fabric | Enabled adapters and jobs governed by the common execution contract. | Planned | Issues #23 to #27 and sandbox/integration evidence. |
| Chapter 4 - Scheduling and Observability | Durable scheduler, retry/idempotency, correlation, alerts, job-health UX. | Planned | Issues #28 to #31 and operational test evidence. |
| Chapter 5 - Deployment Readiness and Launch | Migration, environment, release gate, staging, runbooks, explicit go/no-go. | Planned | Issues #32 to #37, staging evidence, decision log, deployment verification. |

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

Use this record for implementation PR evidence. The PR description may contain the same information, but this register must link to the durable source.

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
4. If the evidence changes a dependency, delivery date, policy, deployment risk, exception, or go/no-go posture, add a decision-log entry and update the task tracker in the same pull request.
5. At chapter close, add a Chapter acceptance record and obtain the required independent review.
6. Before C5-06, every `RC-*` row must be `Verified` or an explicitly allowed `Accepted exception` backed by a founder-authorized decision. The blueprint's release rule remains authoritative when an exception is not allowed.
