# Founder Workflow Acceptance

This is the founder-readable C2-04 acceptance script for the core Agents-Gang governance journey. It combines a deterministic automated sandbox scenario with a protected founder-interface walkthrough that can be reused during staging UAT.

**Sandbox/test data only.** Never use production credentials, live customer data, bearer tokens, raw protected payloads, private prompts, or real external mutations as acceptance evidence.

## Authority and safety rules

1. Use a **Signed founder session** for every founder UI or protected HTTP check. The server remains authoritative for identity and role.
2. Do not add `x-user-role`, client-supplied founder claims, or any other shortcut around the signed-session boundary.
3. **Do not call repository methods directly** from the founder workflow. Direct repository calls in `tests/founder-workflow-acceptance.test.ts` exist only inside the isolated automated sandbox harness so the lifecycle can be reproduced without credentials or network effects.
4. Do not expose or copy `FOUNDER_AUTH_SECRET`. Obtain a test/staging founder session through the environment's approved session mechanism.
5. Use only non-sensitive fixture identifiers in screenshots and evidence. Redact the session field before capture.
6. A failed or conflicting protected request is a failure to act, not permission to assume the requested state locally.

## Phase A - automated sandbox acceptance

From a clean checkout of the commit under review, run:

```bash
npm ci
npm test -- tests/founder-workflow-acceptance.test.ts
```

Then run the full repository gate before accepting the task:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

The focused acceptance test uses only the in-memory execution repository and injected fixture tools. It performs no network request and no real mutation.

### Expected automated results

The test must prove all of the following in one correlated sandbox run:

- **Read workflow:** `shopify.products.read` succeeds without approval at risk 1 and records a successful governed tool call.
- **Draft workflow:** `gmail.draft.create` is blocked before approval, succeeds only after an approved risk-3 request, and consumes that approval on execution.
- **Prepared high-risk action:** `shopify.product.update` uses an exact target-bound approval rather than a browser/local assumption.
- **Approve path:** an approved request permits the matching action exactly once.
- **Reject path:** a rejected request cannot execute and returns `approval_not_approved`.
- **Replay block:** reusing the consumed draft approval is blocked with `approval_not_approved`.
- **External failure:** an injected `shopify_timeout` remains a safe retriable governed failure, records the tool failure and audit event, and does not leak the fixture payload.
- **Audit inspection:** the dashboard snapshot correlates run, routing, tool-call, audit, and approval records by durable IDs while omitting raw payload summaries, audit metadata, and run input/output summaries.
- **Authorization:** a client-supplied founder role header is rejected; a valid signed founder session is accepted.

If any expected result differs, mark the run failed and attach the failing test name plus the GitHub Actions run. Do not work around the failed guard to continue the script.

## Phase B - protected founder interface walkthrough

Use a deployed test or staging build containing the accepted C2-01 through C2-03 work. Prepare only non-sensitive fixture records through the approved sandbox/test fixture process. The operator should never seed state by calling repository internals.

### Preconditions

- The build/commit under test is recorded.
- A valid signed founder session for the test/staging environment is available.
- `/approvals` and `/dashboard` are reachable.
- The environment contains fixture examples for:
  - one pending draft/high-risk approval that will be approved;
  - one pending high-risk approval that will be rejected;
  - one consumed approval or replay-block fixture;
  - one injected external-failure run;
  - one successful read operation.
- No fixture contains production email addresses, customer data, production Shopify IDs, secrets, or private prompts.

### Access check

1. Open `/dashboard` without entering a session.
2. Verify private telemetry is not loaded.
3. Enter an invalid or expired session and submit.
4. Verify the protected boundary reports an authorization failure and no protected state is shown.
5. Enter the valid signed founder session.
6. Verify persisted telemetry loads.

Expected result: only the trusted signed founder session grants access. No client-supplied role shortcut is accepted.

## Read workflow

1. Open `/dashboard` with the valid founder session.
2. Locate the successful sandbox read run.
3. Verify the run has a durable **Run ID**.
4. Verify the corresponding routing decision and `shopify.products.read` tool call show the same Run ID.
5. Verify the read is not shown as pending approval.

Expected result: the founder can correlate the safe read execution without seeing raw request content.

## Draft workflow

1. Open `/approvals` and select the pending `gmail.draft.create` fixture.
2. Verify requester, safe action summary, target identifier, risk, requested time, expiry when present, and `Pending` status are visible.
3. Verify no raw message body, bearer token, private prompt, or protected payload is shown.
4. Start the approval action.
5. Verify the confirmation repeats the exact decision, action type, and target.
6. Confirm approval.
7. Verify the protected API confirms the saved approval before the UI reports the terminal result.
8. After the sandbox execution consumes the approval, refresh persisted state and verify it becomes `Consumed`.

Expected result: approval is intentional, server-confirmed, target-bound, and one-use.

## Prepared high-risk action

1. Select the pending `shopify.product.update` fixture.
2. Verify risk is 3 or higher and the target shown in the confirmation matches the fixture target exactly.
3. Do not approve yet.
4. Verify the protected execution fixture cannot execute while the request remains pending.

Expected result: preparing a high-risk action does not itself authorize execution.

## Approve path

1. On the prepared high-risk fixture, enter a non-sensitive decision note.
2. Choose **Approve action**.
3. Verify the confirmation repeats **Approve**, action type, and target.
4. Confirm approval.
5. Verify the UI waits for the protected server response.
6. Refresh the queue/detail and verify persisted state is `Approved` until execution, then `Consumed` after the matching sandbox execution.

Expected result: no browser-only state can manufacture approval or consumption.

## Reject path

1. Select the fixture reserved for rejection.
2. Choose **Reject** and confirm the exact action/target.
3. Verify the protected response succeeds before the UI reports `Rejected`.
4. Attempt the corresponding sandbox execution through the automated acceptance path.
5. Verify it is blocked with `approval_not_approved`.

Expected result: a rejected request never executes.

## Replay block

1. Locate the previously consumed approval in `/approvals` or the correlated dashboard records.
2. Verify decision controls are unavailable for the consumed request.
3. Run the automated replay assertion in `tests/founder-workflow-acceptance.test.ts`.
4. Verify the repeated execution attempt is blocked with `approval_not_approved` and no second success is recorded.

Expected result: one approved request cannot authorize multiple executions.

## External failure

1. Run the automated fixture that injects `shopify_timeout` after a matching approval.
2. Open `/dashboard` and select **Needs attention**.
3. Verify the failed run and failed tool call are visible and correlated by Run ID.
4. Verify the safe failure code is visible where supported without an upstream response body or credential detail.
5. Verify an audit event exists for the failed execution.

Expected result: the founder can identify the failure and its governance trail without sensitive provider output crossing the dashboard boundary.

## Audit inspection

1. From the failed or blocked run, note its Run ID.
2. Verify the routing decision, tool call, and audit event panels contain matching Run ID correlation where applicable.
3. Verify approval IDs are shown only where they help correlation and do not expose approval payload content.
4. Verify routing explanation is the server-generated safe explanation rather than raw orchestrator text.
5. Verify audit metadata and run input/output summaries are not rendered.

Expected result: the founder can reconstruct what happened from safe persisted state without needing logs or tribal knowledge.

## Evidence capture

Capture only after each expected result is confirmed. Never capture the founder session field while it contains a token.

| Evidence | Required capture | Sensitive-data rule |
|---|---|---|
| C2-04-A | Focused acceptance test output showing pass | No environment dump |
| C2-04-B | Full quality gate result for exact commit | Link CI run, do not paste secrets |
| C2-04-C | Pending approval detail | Non-sensitive fixture identifiers only |
| C2-04-D | High-impact confirmation showing decision/action/target | No raw payload |
| C2-04-E | Approved/consumed lifecycle result | No token or protected payload |
| C2-04-F | Rejected lifecycle result | No token or protected payload |
| C2-04-G | Needs-attention dashboard with failed run/tool correlation | Safe error code only |
| C2-04-H | Audit/routing/tool correlation by Run ID | No audit metadata/raw summaries |
| C2-04-I | Permission-denied state with invalid session | Session field empty/redacted |

Record the commit SHA, environment classification, UTC execution time, operator, result, CI link, and screenshot locations in `docs/RELEASE_EVIDENCE_REGISTER.md` or the staging evidence location selected by C5-04.

## RC-05 mapping

This suite contributes automated and operator evidence to **RC-05**, which requires the founder operations surface to show durable state and handle relevant approval/dashboard states. C2-04 does not by itself mark RC-05 `Verified`: staging screenshots/walkthrough evidence and independent review must still be attached before that release gate changes status.

The same scenario and screenshot checklist are intentionally reusable by C5-04 Founder UAT. C5-04 should reference this script rather than creating a conflicting second governance walkthrough.

## Pass/fail and discrepancy handling

Pass only when:

- the focused acceptance test is green;
- the full quality gate is green on the exact commit under review;
- the founder walkthrough uses the protected signed-session path;
- approve, reject, replay-block, external-failure, and audit-inspection outcomes match this document;
- no sensitive data appears in screenshots or dashboard/API responses;
- required evidence locations are recorded.

If any item fails, record the discrepancy with the non-sensitive fixture ID, expected result, observed result, exact commit, and CI or screenshot link. Open or link a defect before repeating the scenario. Do not relabel a failed result as verified and do not bypass authorization, approval, target binding, or one-time consumption to make the walkthrough pass.
