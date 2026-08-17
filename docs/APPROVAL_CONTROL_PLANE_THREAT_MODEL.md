# Approval Control Plane Threat Model

## Scope and trust boundaries

The approval API is a server-only founder control plane. Requests cross an untrusted network boundary; bearer claims and all query/body/path values are hostile until verified. `FOUNDER_AUTH_SECRET`, Supabase service credentials, raw mutation payloads, and protected tool inputs must never cross the API response or logging boundary. The repository is authoritative for state and uses compare-and-set transitions.

## Security invariants

1. Anonymous, malformed, expired, revoked, and non-founder sessions fail closed before storage access.
2. Lists and details expose a bounded safe DTO, never raw tool arguments, credentials, prompts, or environment values.
3. Lists have a maximum page size, validated filters, and deterministic `(created_at, id)` descending cursors.
4. A decision may transition only `pending` to `approved` or `rejected`; server time supplies decision timestamps. Any missing expiry is unbounded by design, while a malformed or elapsed expiry fails closed.
5. Every well-formed authenticated decision attempt is audited with actor, requested decision, outcome, and a non-sensitive reason.
6. Execution revalidates action and target, then atomically consumes an `approved` record before the external effect. A consumed approval cannot be replayed.
7. API errors are stable, generic, and do not serialize thrown errors or persistence responses.

## Abuse cases and mitigations

| Abuse case | Mitigation / regression evidence |
|---|---|
| Forge role headers or tamper with a token | HMAC verification and founder role authorization tests |
| Use another action or target with a valid approval | Exact action/target matching in the shared executor tests |
| Duplicate decisions or race decision requests | Repository compare-and-set against `pending`; conflict response |
| Execute twice with one approval | Compare-and-set consumption before effect; replay regression test |
| Decide after expiry | Decision route rejects expired records; execution gate checks expiry |
| Supply a malformed expiry timestamp to bypass expiry checks | Shared `isApprovalExpired` parser treats invalid timestamps as expired in both decision and execution paths |
| Enumerate via unbounded queries | Validated filters, 100-record maximum, opaque cursor |
| Inject malformed JSON, cursor, dates, or statuses | Parser validation and bounded decision notes |
| Exfiltrate payloads, tokens, or persistence errors | Safe DTO and generic error taxonomy |

## Residual risks and operations

Bearer tokens remain replayable until expiry unless their session ID is added to `FOUNDER_REVOKED_SESSION_IDS`; production should use short lifetimes, TLS, secret rotation, and a durable session/revocation provider. Approval consumption prevents application-level replay, but an external adapter must also use an idempotency key for ambiguous transport failures. Audit storage failure currently fails the decision request rather than silently losing evidence.
