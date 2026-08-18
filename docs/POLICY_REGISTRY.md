# Capability and Risk Policy Registry

The policy registry is the governance source of truth for every enabled tool and scheduled job action. It lives in `lib/policy/registry.ts` and is deliberately server-side code. The registry contains no credentials, raw protected payloads, or user-specific approval data.

## Required policy fields

Every enabled tool entry must define an owner, capability, numeric risk level, approval requirement, target identity, external effect, idempotency strategy, and enabled state. Every scheduled job entry must define its owner, referenced tools, external-effect classification, idempotency requirement, and enabled state.

Tool capabilities are `read`, `draft`, `prepare`, or `execute`. External effects distinguish `none`, `read`, `draft`, `notify`, and `mutate`. Idempotency is either not applicable, represented by a deterministic key, or explicitly required.

## Approval rules

High-risk actions at risk level 3 or above must remain approval-gated. Any action classified as a mutation must also be approval-gated, even if a future risk-level calibration would otherwise lower its numeric score. Publishing, email-send behavior, price changes, deletion, inventory changes, and other high-risk external mutations must never be enabled without a corresponding approval policy.

Scheduled jobs may read or prepare data, but they must not bypass the governed execution contract. Each job’s `neededTools` list must resolve to registered tool names. A job’s own external effect is `none`; external effects belong to the governed tool calls it invokes.

## Change procedure

When adding or changing a tool or scheduled job, update the registry in the same pull request as the runtime implementation. Add or update completeness tests before production changes and verify that the tests fail for the missing or inconsistent policy. Review the owner, capability, risk, approval, target, external-effect, and idempotency fields together rather than copying a single risk literal from an adjacent tool.

For a policy change, the pull request must explain the safety impact, whether existing approval behavior changes, how duplicate or retry behavior is handled, and whether any job or adapter now references a new external effect. The registry’s import-time invariants and the policy-registry test suite must remain green.

The shared `defineTool` helper rejects registered tool definitions whose capability or risk metadata drifts from the registry. Unregistered test-only tools remain permitted so unit tests can exercise generic execution behavior without pretending those fixtures are production actions.
