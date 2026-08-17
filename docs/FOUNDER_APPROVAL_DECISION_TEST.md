# Founder Approval Decision Test

Use this script to verify the C2-02 founder decision experience against persisted approval state. Use test or staging data only. Do not paste secrets, raw protected payloads, or production credentials into evidence.

## Preconditions

- Use a valid signed founder session.
- Confirm the approval list and detail endpoints are reachable through the protected founder boundary.
- Prepare at least two pending approval requests, including one risk 3 or higher request.
- Keep a second session or test harness available to change one request after it is displayed so the stale/conflict path can be exercised.

## Approval path

1. Open the pending queue and select a pending request.
2. Enter a decision note.
3. For a risk 3 or higher request, choose **Approve action**.
4. Verify the confirmation repeats **Approve**, the exact action type, and the exact target.
5. Press `Escape`. Verify the confirmation closes and keyboard focus returns to the initiating button.
6. Open the confirmation again and choose **Confirm approval**.
7. Verify the interface shows a submitting state and does not display approved before the protected API succeeds.
8. Verify the queue refreshes from persisted state after success.
9. Verify the request detail shows `Approved` and the protected server decision result.
10. If the current filter is `Needs review`, verify the approved request no longer remains in that pending list.

Expected result: the interface reports that approval was saved by the protected server and uses the server response as the resulting state.

## Rejection path

1. Open another pending request and enter a decision note.
2. Choose **Reject**.
3. For a risk 3 or higher request, verify the confirmation repeats **Reject**, the exact action type, and the exact target.
4. Choose **Confirm rejection**.
5. Verify the interface shows a submitting state and does not manufacture a rejected state before the protected API succeeds.
6. Verify the queue refreshes from persisted state.
7. Verify the detail shows `Rejected` and the protected decision result.

Expected result: the interface reports that rejection was saved by the protected server.

## Stale and terminal-state path

1. Load a pending request in the founder interface.
2. Change that request from a separate test session so the displayed copy is stale. Exercise each terminal state where feasible: approved, rejected, expired, and consumed.
3. Submit a decision from the stale interface.
4. Verify the protected PATCH returns a conflict and the interface says **No action was taken**.
5. Verify the interface reloads the request detail and queue from protected persisted state.
6. Verify the message identifies the actual terminal state: already approved, already rejected, expired, or already consumed.
7. Verify approve/reject controls are absent for the terminal request.

Expected result: a rejected or conflicting API call never creates a local approved/rejected state. The founder sees the latest persisted state and must deliberately act again only if the request remains pending.

## Error path

1. Submit with an invalid or expired founder session, or simulate a protected API failure in test/staging.
2. Verify the interface reports that no decision state was assumed because the protected API did not confirm the change.
3. Verify the existing persisted request state remains unchanged in the UI until a successful protected refresh occurs.

## Evidence to capture

Record the branch/commit, quality-gate run, test environment, request IDs using non-sensitive identifiers, observed lifecycle outcomes, and any discrepancy. Do not record bearer tokens or protected payload content.
