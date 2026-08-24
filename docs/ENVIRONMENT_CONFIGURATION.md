# Environment and Secret Configuration

## Operating rule

Agents-Gang staging and production deployments fail closed on ambiguous, missing, malformed, placeholder, or incompatible configuration.

Optional integrations are controlled by explicit boolean feature flags. A disabled optional integration does not require its credentials and does not block unrelated governed operation.

Managed deployments must set every optional feature flag to exactly `true` or `false`. Missing flags are treated as configuration ambiguity.

Run the deployment check with:

```bash
npm run validate:env
```

The command reports only variable names, feature names, safe error codes, and safe remediation text. It never prints configured secret values.

The Next.js server also validates staging and production configuration on Node server startup through `instrumentation.ts`. Development remains permissive so local builds and unrelated test work do not require external credentials.

## Deployment target

`AGENTS_GANG_ENVIRONMENT` accepts:

- `development`
- `staging`
- `production`

Staging and production are managed targets. Core governance configuration is required for both.

## Inventory by feature and risk

| Variable | Feature | Secret | Risk | Requirement |
|---|---|---:|---:|---|
| `SUPABASE_URL` | core | No | 3 | Required in staging/production; HTTPS |
| `SUPABASE_SERVICE_ROLE_KEY` | core | Yes | 4 | Required in staging/production web runtime and supplied to the staging bridge |
| `FOUNDER_AUTH_SECRET` | core | Yes | 4 | Required in staging/production; minimum strength |
| `FOUNDER_REVOKED_SESSION_IDS` | core | No | 3 | Optional safe identifier list |
| `AI_ENABLED` | ai | No | 2 | Explicit true/false in managed deployments |
| `AI_PROVIDER` | ai | No | 2 | Anthropic when AI is enabled |
| `ANTHROPIC_API_KEY` | ai | Yes | 3 | Required only when AI is enabled |
| `ANTHROPIC_MODEL` | ai | No | 2 | Optional bounded model identifier |
| `SHOPIFY_ENABLED` | shopify | No | 4 | Explicit true/false in managed deployments |
| `SHOPIFY_STORE_MODE` | shopify | No | 4 | Test outside production; production in production |
| `SHOPIFY_STORE_DOMAIN` | shopify | No | 4 | Required when Shopify is enabled |
| `SHOPIFY_TEST_STORE_DOMAIN` | shopify | No | 3 | Required and equal to store domain in test mode |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | shopify | Yes | 4 | Required only when Shopify is enabled |
| `SHOPIFY_REQUEST_TIMEOUT_MS` | shopify | No | 2 | Optional 1,000-30,000 ms |
| `GMAIL_ENABLED` | gmail | No | 4 | Explicit true/false in managed deployments |
| `GMAIL_ACCESS_TOKEN` | gmail | Yes | 4 | Required only when Gmail is enabled |
| `GMAIL_REQUEST_TIMEOUT_MS` | gmail | No | 2 | Optional 1,000-30,000 ms |
| `GMAIL_SEND_ENABLED` | gmail | No | 4 | Requires Gmail enabled; remains approval-gated in runtime policy |
| `WEB_SEARCH_ENABLED` | web_search | No | 2 | Explicit true/false in managed deployments |
| `BRAVE_SEARCH_API_KEY` | web_search | Yes | 2 | Required only when web search is enabled |
| `INBOX_ALERTS_ENABLED` | inbox_alerts | No | 3 | Explicit true/false in managed deployments |
| `INBOX_ALERT_WEBHOOK_URL` | inbox_alerts | Yes | 3 | Required HTTPS URL only when alerts are enabled |
| `DATABASE_URL` | migration | Yes | 4 | Migration-only; optional for app runtime |

Risk reflects the consequence of exposure or misconfiguration, not whether the corresponding tool is automatically allowed to act. Runtime approval and capability policy remain separate controls.

## Core governance configuration

Staging and production require:

- a valid HTTPS Supabase URL;
- a non-placeholder founder authentication secret of at least 32 characters;
- a non-placeholder Supabase service-role key.

The staging dashboard accesses data through the authenticated read-only bridge
described below. Other staging workflows still use the service-role credential
from the web runtime for governed persistence.

Missing core configuration is a startup failure because the application cannot preserve its governed execution/audit or trusted founder identity boundaries without it.

## Feature isolation

### AI

When `AI_ENABLED=false`, Anthropic configuration is not required by deployment validation.

When enabled, `AI_PROVIDER` must resolve to the supported Anthropic provider and `ANTHROPIC_API_KEY` must be configured. Model identifiers are bounded to avoid malformed configuration.

### Shopify

Shopify is deliberately environment-separated:

- `development` and `staging` require `SHOPIFY_STORE_MODE=test` when Shopify is enabled;
- `production` requires `SHOPIFY_STORE_MODE=production` when Shopify is enabled;
- test mode requires `SHOPIFY_TEST_STORE_DOMAIN` to match `SHOPIFY_STORE_DOMAIN`.

This prevents a staging deployment from being configured against production Shopify mode by accident.

### Gmail

`GMAIL_ENABLED=false` means Gmail credentials are not required.

`GMAIL_SEND_ENABLED=true` is invalid unless Gmail itself is enabled. This feature switch does not replace the risk-4 policy and approval gate already enforced for `gmail.draft.send`.

### Web search

`WEB_SEARCH_ENABLED=false` means no Brave API key is required.

### Inbox alerts

`INBOX_ALERTS_ENABLED=true` requires an HTTPS webhook URL. Treat that URL as a secret because webhook paths frequently embed bearer material.

## Placeholder and malformed-value rejection

The validator rejects common committed placeholder forms such as `your_*`, `replace_*`, and angle-bracket placeholders when a secret is required.

Timeout values must be integers between 1,000 and 30,000 milliseconds. Managed feature flags must be exactly `true` or `false`.

Validation errors never echo the configured value. For example, a bad `GMAIL_ACCESS_TOKEN` is reported by variable name and safe error code only.

## Server-only secret policy

Secret inventory entries must never use a `NEXT_PUBLIC_` prefix. Do not pass them into client component props, browser responses, structured log payloads, screenshots, or issue comments.

Automated secret-hygiene tests scan committed text surfaces for common live credential signatures and verify `.env.example` contains placeholders rather than live credentials.

`DATABASE_URL` is migration-only and is not required by application startup. The C5-01 migration runner converts it to libpq environment variables before invoking `psql`, so the URL/password is not placed in process arguments.

## Deployment procedure

Before promoting staging or production:

1. Set `AGENTS_GANG_ENVIRONMENT` to the intended target.
2. Explicitly set every optional feature flag to `true` or `false`.
3. Configure only the credentials required for enabled features.
4. Run `npm run validate:env` in the deployment environment.
5. Stop promotion on any validation error.
6. Retain only the safe validation outcome in release evidence, never environment values.

### Staging persistence bridge

The staging dashboard reads governed records through the deployed
`agents-gang-persistence-bridge` Supabase Edge Function. Deploy it from the
repository root with `supabase functions deploy agents-gang-persistence-bridge`.
The function must receive `FOUNDER_AUTH_SECRET` and, when used,
`FOUNDER_REVOKED_SESSION_IDS`; Supabase provides its URL and service-role key to
the function runtime. The staging web runtime also requires the key until all
non-dashboard persistence operations have a bridge-backed transport.

The bridge disables Supabase JWT verification because founder sessions use the
application's signed-session format. It independently verifies signature,
expiry, founder role, and revocation, and only proxies read-only dashboard
queries to an explicit table allowlist and fixed dashboard-safe projections.

C5-03 is responsible for making this validation an enforced release status check. C5-06 remains responsible for the actual founder-authorized production promotion.
