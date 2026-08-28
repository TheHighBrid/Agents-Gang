# Google Calendar policy contract

The Calendar boundary is disabled unless `CALENDAR_ENABLED` is explicitly enabled. OAuth credentials remain server-side and adapter errors are normalized without returning provider payloads or tokens.

| Action | Capability | Risk | Approval | Idempotency |
|---|---|---:|---|---|
| `calendar.events.read` | Read | 1 | None | Not applicable |
| `calendar.focus.create` | Execute | 3 | Exact prepared event | Required caller key |

Focus-block preparation validates and canonicalizes the summary, timestamps, and caller-supplied idempotency key before approval. Approval binds a SHA-256 digest of that complete canonical input. The adapter sends the key both as request metadata and as a private event property; callers must reuse the same key when retrying the same intended event.

Calendar reads request expanded, start-time-ordered events within an explicit time range. Free-time discovery is a read-only local calculation over those normalized events. Cancelled events do not consume availability.

Safe failure codes are `calendar_auth_failed`, `calendar_rate_limited`, `calendar_upstream_failed`, `calendar_transport_failed`, `calendar_timeout`, and `calendar_malformed_response`. Authentication failures and non-5xx upstream failures are not retryable; rate limits, timeouts, transport failures, malformed responses, and 5xx failures are retryable.

`tests/calendar.test.ts` covers the provider boundary, normalization, idempotency metadata, free-time calculation, and safe failures. `tests/calendar-tool.test.ts` covers governed reads, approval gating, exact target binding, execution, and approval consumption.
