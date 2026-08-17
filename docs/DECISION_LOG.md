# Agents-Gang Decision Log

This log records implementation, governance, release, exception, and go/no-go decisions that materially affect Agents-Gang. It is intentionally human-readable and evidence-backed. Routine implementation details that do not change scope, dependency, policy, risk, or release posture belong in the pull request instead.

Related sources: [Operational Completion Blueprint](./OPERATING_BLUEPRINT.md), [Task Tracker](./TASK_TRACKER.md), [Release Evidence Register](./RELEASE_EVIDENCE_REGISTER.md), and [Agent Work Orders](./AGENT_WORK_ORDERS.md).

## When a decision entry is required

Create an entry when any of the following occurs:

- a dependency or milestone order changes;
- an authentication, authorization, approval, capability, or risk policy changes;
- a database migration or irreversible data decision changes;
- a production integration or external mutation capability is enabled or disabled;
- a release requirement is waived, accepted as an exception, or deferred;
- a staging defect is accepted rather than fixed before release;
- the founder makes a go/no-go, deployment-window, rollback, or mutation-enable decision;
- two governing documents conflict and one interpretation is chosen.

Do not place credentials, tokens, customer data, private prompts, protected payloads, or other sensitive material in this log. Link to payload-safe evidence instead.

## Decision fields

Every decision entry must contain these fields:

| Field | Required content |
|---|---|
| Date | UTC date/time of the decision. |
| Decision owner | Person or role with authority for the decision. |
| Context | The concrete condition, problem, dependency, or tradeoff being decided. |
| Options | Reasonable alternatives that were actually considered. |
| Chosen action | The selected option, stated unambiguously. |
| Evidence | Links to PRs, commits, CI runs, tests, staging records, issues, or other inspectable proof. |
| Consequences | Expected impact, residual risk, follow-up work, rollback implications, or changed schedule. |

Also include the affected task IDs, required reviewers, and status where applicable.

## Decision status vocabulary

- `Proposed`: recorded for review, not yet authoritative.
- `Decided`: approved by the named decision owner and currently authoritative.
- `Superseded`: replaced by a later decision whose ID is linked.
- `Reversed`: intentionally rolled back, with the reversal evidence linked.

## Decision ID convention

Use `DEC-YYYYMMDD-NN`, incrementing `NN` for multiple decisions on the same UTC date.

## Decision register

No baseline decisions are fabricated here. Add rows only when an authorized decision has actually been made.

| Decision ID | Date | Status | Decision owner | Affected task(s) | Chosen action | Evidence |
|---|---|---|---|---|---|---|

## Decision entry template

```markdown
### DEC-YYYYMMDD-NN - <short decision title>
- Status: Proposed | Decided | Superseded | Reversed
- Date: <YYYY-MM-DD HH:MM UTC>
- Decision owner:
- Affected task IDs/issues:
- Required reviewers:

#### Context
<What condition or tradeoff required a decision?>

#### Options
1. <Option A>
2. <Option B>
3. <Option C, if applicable>

#### Chosen action
<State the selected action exactly.>

#### Evidence
- <PR / commit / CI / test / staging / issue / evidence-register links>

#### Consequences
- Immediate impact:
- Residual risk:
- Follow-up work:
- Schedule/dependency impact:
- Rollback or reversal condition:

#### Review record
- Reviewer:
- Review result/date:
```

## Decision procedure

1. Confirm the decision owner from `docs/OPERATING_BLUEPRINT.md` before recording a decision as `Decided`.
2. Add the full decision entry and one summary row in the register above.
3. Link inspectable evidence and the affected task/issue IDs.
4. Update `docs/RELEASE_EVIDENCE_REGISTER.md` when the decision affects release readiness, an accepted exception, staging/UAT, or go/no-go posture.
5. Update `docs/TASK_TRACKER.md` in the same pull request when the decision changes a dependency, milestone, target date, or task status materially.
6. Never delete historical decisions. Mark them `Superseded` or `Reversed` and link the replacement.
