# Capability and Risk Policy Registry

The governance source of truth for enabled external tool actions and scheduled jobs is `lib/execution/policy-registry.ts`. The registry contains policy metadata only and must never contain credentials, raw protected payloads, customer data, message bodies, or hidden prompts.

## Tool policy contract

Every enabled tool entry defines its owner, capability, risk level, approval requirement, target-binding rule, target identity, external-effect classification, idempotency status, and enabled state.

The execution boundary enforces this registry twice by design: `defineTool()` rejects unregistered or drifted definitions during construction, and `executeTool()` calls `assertToolPolicy()` again before any approval lookup, input parsing, or external effect. Constructing a `ToolDefinition` directly therefore cannot bypass policy.

High-risk actions at risk level 3 or above remain approval-gated. Mutating actions must remain approval-gated even if their numeric risk classification changes later.

## Scheduled-job policy contract

Every enabled scheduled job has a separate policy entry with its owner, governed tool dependencies, external-effect classification, idempotency requirement, and enabled state. Job entries may reference only registered tools.

Current scheduled inventory:

- `job.daily_melato_audit`
- `job.product_catalog_audit`
- `job.product_page_scan`
- `job.inbox_triage`
- `job.weekly_trend_radar`

## Idempotency vocabulary

- `not_applicable`: read-only behavior with no external effect to deduplicate.
- `deterministic_key`: the governed action derives a stable identity used by its current contract.
- `required`: durable deduplication is a required property of the action or job.
- `unsupported`: the current adapter does not yet provide a trustworthy idempotency guarantee.

`unsupported` is an explicit release-safety signal. It does not permit blind retry, duplicate delivery, or bypassing approval. Downstream integration and scheduler work must not advertise retry safety for such an action until durable idempotency is implemented and tested.

## Change procedure

When a tool or scheduled job is added, removed, renamed, or changes behavior:

1. Update the registry in the same pull request as the runtime change.
2. Add or update a failing-first completeness or policy-drift regression.
3. Verify owner, capability, risk, approval requirement, target identity, external effect, idempotency, and enabled state against actual runtime behavior.
4. Keep risk-3/risk-4 and mutating actions approval-gated.
5. Do not claim idempotency the adapter cannot prove across duplicate delivery or ambiguous transport failure.
6. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test` before review.
7. Require Codex review for execution/security implications and Manus review for integration inventory changes.

The import-time registry invariants, policy-registry tests, and execution-boundary regression must remain green.
