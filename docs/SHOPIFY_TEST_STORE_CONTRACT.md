# Shopify Test-Store Contract

## Purpose

The Shopify adapter is server-only and must be exercised against a dedicated test store during development, CI, and integration verification. No credential, access token, raw upstream error body, or mutation payload is emitted through client responses or audit metadata.

## Configuration boundary

| Environment variable | Test-store requirement |
|---|---|
| `SHOPIFY_STORE_MODE` | Must be `test` for development and CI. Production deployment requires the explicit value `production`. |
| `SHOPIFY_STORE_DOMAIN` | Must be a valid `*.myshopify.com` domain. |
| `SHOPIFY_TEST_STORE_DOMAIN` | In `test` mode, must exactly equal `SHOPIFY_STORE_DOMAIN`; a mismatch fails configuration before any network request. |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Server-only Admin API token. It is never logged or returned. |
| `SHOPIFY_REQUEST_TIMEOUT_MS` | Optional integer from 1,000 to 30,000 milliseconds; defaults to 10,000 milliseconds. |

## Governed execution contract

Shopify reads remain capability-gated at risk level 1. Shopify creates, updates, variant changes, and inventory adjustments are risk level 3, require an approved request, require exact action and target binding where applicable, and are consumed before the external effect. Inventory changes additionally require an idempotency key.

The adapter is dependency-injected for fixture-based integration tests. Its transport uses a bounded abort signal and converts upstream outcomes into safe classifications. Governed execution records only the allowlisted classification, never the upstream response body or credentials.

| Upstream condition | Safe classification | Retriable |
|---|---|---:|
| 401 or 403 | `shopify_auth_failed` | No |
| 429 | `shopify_rate_limited` | Yes |
| Abort or timeout | `shopify_timeout` | Yes |
| Transport failure | `shopify_transport_failed` | Yes |
| Other non-success HTTP response | `shopify_upstream_failed` | Only 5xx |
| GraphQL error payload | `shopify_graphql_failed` | No |
| Mutation `userErrors` | `shopify_user_error` | No |
| Invalid or malformed JSON response | `shopify_malformed_response` | Yes |

## Test evidence

`tests/shopify-adapter-boundary.test.ts` verifies the test-store allowlist, timeout signal, and normalized failure contract with a fake transport. `tests/shopify-tools.e2e.test.ts` verifies the real adapter wiring for governed reads and approved mutations using the explicit test-store fixture, and verifies normalized rate-limit and timeout classifications are preserved in tool-call and audit records.
