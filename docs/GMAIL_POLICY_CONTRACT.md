# Gmail Read, Draft, and Send Policy Contract

## Default posture

The Gmail adapter is server-only. `GMAIL_ACCESS_TOKEN` is never sent to client code, persisted to execution metadata, or included in provider error messages. Metadata search is read-only. Draft creation requires explicit approval, and actual sending is disabled unless the server-side `GMAIL_SEND_ENABLED` switch is explicitly set to `true`.

## Governed action policy

| Action | Capability | Risk | Approval requirement | Target binding |
|---|---|---:|---|---|
| `gmail.messages.search` | Read | 1 | None | None |
| `gmail.draft.create` | Draft | 3 | Required | SHA-256 digest of the complete draft payload |
| `gmail.draft.send` | Execute | 4 | Required | Exact Gmail draft ID |

Gmail sends can operate only on an existing Gmail draft. The send adapter accepts only `draftId`; it never accepts a recipient, subject, or message body. The approval is atomically consumed before the external send request, preventing application-level replay.

## Privacy and configuration rules

Draft approval summaries retain the intended recipient, subject, and body length for reviewer context but never persist the message body. The execution target for draft creation binds the complete draft payload by digest, so any recipient, subject, thread, or body modification after approval is rejected. The exact content remains in-memory until the governed adapter creates the draft.

`GMAIL_SEND_ENABLED=false` is the default in `.env.example`. The provider checks this switch before checking credentials or initiating a network request. `GMAIL_REQUEST_TIMEOUT_MS` is bounded from 1,000 to 30,000 milliseconds and defaults to 10,000 milliseconds. Approved sends in test fixtures must pass an explicit server-side `sendEnabled: true` option; no real Gmail mutation is performed in the integration suite.

## Provider failure normalization

| Provider condition | Safe code | Retriable |
|---|---|---:|
| 401 or 403 | `gmail_auth_failed` | No |
| 429 | `gmail_rate_limited` | Yes |
| Transport failure | `gmail_transport_failed` | Yes |
| Abort or timeout | `gmail_timeout` | Yes |
| Other non-success HTTP response | `gmail_upstream_failed` | Only 5xx |
| Invalid or malformed JSON response | `gmail_malformed_response` | Yes |

Only the allowlisted safe code and retry classification are persisted in governed tool-call and audit records. Raw upstream bodies, credentials, and mail bodies are not included.

## Test evidence

`tests/gmail.test.ts`, `tests/gmail-draft-adapter.test.ts`, and `tests/gmail-send.test.ts` cover provider configuration, safe failure normalization, draft/send endpoint behavior, no-send default behavior, risk gates, target binding, and audit propagation. `tests/gmail-tools.e2e.test.ts` uses an injected fixture transport to cover a metadata read, approved thread-safe draft creation, and explicitly enabled, approved exact-draft send in one governed flow.
