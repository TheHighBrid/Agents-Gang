# Agents-Gang Operations Runbook

## Release posture and authority

**Prepared but unrehearsed.** This runbook translates the currently implemented controls into an operator procedure; it **does not authorize a production deployment**, enable real external mutations, or change any release-evidence gate to verified. C5-01 migration tooling and C5-02 managed-environment validation have inspectable implementation evidence, but C5-03 still lacks verified GitHub `main` platform enforcement and a promotable post-merge release manifest. C5-04 staging soak and founder UAT remain blocked on that release-control evidence.

The founder is the only decision owner for a production deployment window, enabling real mutations, accepting a release exception, or choosing between continued operation and rollback. An operator may execute approved, reversible containment steps, but must record material release, migration, mutation, and rollback decisions in [`DECISION_LOG.md`](./DECISION_LOG.md). Evidence belongs in [`RELEASE_EVIDENCE_REGISTER.md`](./RELEASE_EVIDENCE_REGISTER.md); neither document may contain credentials, access tokens, customer data, message bodies, or protected payloads.

| Role | Minimum responsibility | May not do unilaterally |
|---|---|---|
| Founder | Approve deployment window, mutation enablement, exceptions, and go/no-go decisions. | Delegate an undocumented release exception. |
| Release operator | Execute preflight, capture evidence, deploy an approved build, and perform approved containment. | Enable Gmail sending, enable live Shopify mutations, or run destructive rollback without founder approval. |
| Integration owner | Validate test-account/test-store behavior and interpret safe provider error classes. | Paste provider responses, credentials, or message content into operational evidence. |
| Database operator | Take an approved backup, apply rehearsed migration steps, and verify schema outcomes. | Run a destructive down migration without the documented preconditions and founder decision. |

## Operating boundaries and current limitations

The system is a governed execution foundation, not a completed release platform. Approval decisions and high-risk tool execution are persisted and audited, but the release checklist remains planned. The dashboard is an inspection surface; it does not provide deploy, scheduler-retry, rollback, or mutation-disable controls. Public trigger and retry controls are deferred to C4-02, and job-health controls are deferred to C4-04.

| Boundary | Current operator rule |
|---|---|
| Gmail | Metadata reads are risk 1; draft creation is risk 3 and payload-bound; draft sending is risk 4 and exact-draft-bound. Sending remains off unless `GMAIL_SEND_ENABLED=true` is explicitly set server-side. |
| Shopify | Test and CI use `SHOPIFY_STORE_MODE=test`. Live operation requires explicit `production`. `SHOPIFY_ENABLED=false` disables the adapter; token revocation/removal remains the stronger emergency stop when credential compromise is suspected. |
| Scheduler | Idempotency, retry classification, leases, and durable job state exist. There is no public retry, trigger, cancel, or force-unlock control. Stop the upstream scheduler rather than attempting ad hoc retries. |
| Approvals | A founder session is required. Approved requests are consumed before an external effect and cannot be replayed. Revocation currently uses `FOUNDER_REVOKED_SESSION_IDS`; rotating `FOUNDER_AUTH_SECRET` invalidates all signed sessions. |
| Persistence | The execution repository requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. `npm run db:migrate` and `npm run db:verify` provide the reviewed migration/verification path, while `npm run validate:env` and server startup enforce managed-environment configuration. |

## Deployment runbook

### 1. Preconditions and release decision

The release operator must stop before deployment unless the founder has supplied an explicit deployment-window decision and the evidence register shows the applicable release gates as verified or founder-authorized exceptions. A planned checklist item is not evidence of readiness.

| Preflight check | Required evidence or action | Stop condition |
|---|---|---|
| Release authority | Founder decision recorded in `DECISION_LOG.md` with UTC window, commit, mutation posture, verification plan, and rollback decision owner. | No decided entry or ambiguous approval. |
| Source integrity | Check out the approved immutable commit; confirm a clean worktree and record `git rev-parse HEAD`. | Local changes, unreviewed commit, or commit differs from the decision. |
| Quality evidence | Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run validate:env`, `npm run supply-chain:check`, and `npm run secrets:scan`; retain only safe command output. | Any check fails or output contains a secret. |
| Staging evidence | Locate the completed C5-04 soak/UAT record and migration rehearsal record. | No verified staging evidence, unresolved critical/high finding, or missing founder UAT. |
| Mutation posture | Record whether Gmail sending and Shopify production access remain disabled. Default to disabled. | A real effect is enabled without founder’s explicit decision. |

### 2. Server-side configuration review

Configure values only through the deployment platform’s server-side secret mechanism. Never place secrets in browser-visible configuration, git commits, screenshots, command history, or evidence documents. Set `AGENTS_GANG_ENVIRONMENT` to `staging` or `production`, set every optional feature flag explicitly to `true` or `false`, run `npm run validate:env` in the deployment environment, and stop promotion on any safe validation error. The Next.js server repeats managed-environment validation at startup.

| Configuration group | Manual validation |
|---|---|
| Core runtime | `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `FOUNDER_AUTH_SECRET` are present server-side and use the approved environment values. |
| Founder containment | `FOUNDER_REVOKED_SESSION_IDS` is empty or contains only deliberately revoked IDs. Never publish session IDs. |
| Gmail | Keep `GMAIL_SEND_ENABLED=false` unless founder approval explicitly authorizes test or production sending. Confirm `GMAIL_REQUEST_TIMEOUT_MS` is within 1,000–30,000 milliseconds. |
| Shopify | Keep `SHOPIFY_STORE_MODE=test` for development, CI, and staging test-store work. Production requires an explicit `SHOPIFY_STORE_MODE=production` decision, a valid `*.myshopify.com` domain, bounded `SHOPIFY_REQUEST_TIMEOUT_MS`, and a server-only token. |
| Alerts | Treat `INBOX_ALERT_WEBHOOK_URL` as a secret-bearing integration value. Leave unset if alert delivery is not explicitly included in the release scope. |

### 3. Database preparation and migration

Use the reviewed migration runner described in [`DATABASE_MIGRATIONS.md`](./DATABASE_MIGRATIONS.md). A fresh empty database uses `npm run db:migration:bundle -- fresh > /tmp/agents-gang-fresh.sql` for inspection and `npm run db:migrate -- fresh` for application; the runner then executes the read-only catalog verification. An existing deployment must name its actual baseline, for example `npm run db:migrate -- upgrade --from 20260815_governed_execution`. Supported baselines are `20260815_governed_execution`, `20260817_approval_consumption`, and `20260818_scheduler_reliability`.

Before an approved migration, capture a restorable database backup or provider recovery point, record the baseline and approved commit, and run `npm run db:verify` after application. The runner fails closed on baseline mismatch and uses `psql` with `ON_ERROR_STOP=on`; do not bypass it with guessed manual DDL. These controls are not authorization to migrate production: C5-03 platform enforcement, C5-04 staging evidence, and founder deployment approval remain release prerequisites.

### 4. Deploy and verify an approved build

After preflight and approved migration rehearsal, deploy only the approved commit using the deployment platform’s established release mechanism. The repository has an in-repository quality, migration-rehearsal, environment-validation, and release-gate workflow, but no verified GitHub `main` platform enforcement or automated deployment workflow. Capture the platform deployment identifier separately without placing secret values in the record.

Post-deploy verification must remain non-destructive unless the founder approved a controlled test effect. Verify that the home page renders, founder authentication rejects anonymous access, the approvals and dashboard endpoints require a valid founder session, execution storage is reachable, and the dashboard shows safe operational data. Exercise provider behavior only with fixture/test accounts or stores until C5-04 evidence authorizes a larger staging scope.

Complete the deployment record with commit, deployment identifier, UTC times, migration evidence, mutation posture, verification result, and a named rollback decision owner. If any check fails, begin containment rather than retrying external effects ad hoc.

## Mutation-disable runbook

Containment takes priority over diagnosing the root cause. Record the UTC time, operator, observed safe error code or dashboard identifier, and action taken. Do not copy raw provider errors, credentials, message bodies, or customer data.

| Effect surface | Immediate disable action | Verification | Residual limitation |
|---|---|---|---|
| Gmail sending | Set `GMAIL_SEND_ENABLED=false`; set `GMAIL_ENABLED=false` as well when all Gmail access must stop; then restart/redeploy the affected service. | Confirm the runtime configuration was updated through the secret manager; do not submit a real email just to test containment. | Existing Gmail drafts remain in the mailbox; they are not sent by this action. |
| Shopify API effects | Set `SHOPIFY_ENABLED=false` and restart/redeploy; revoke or remove the Shopify Admin API token through the approved provider/admin process if compromise is suspected. | Confirm the feature is disabled and the token is no longer available to the running service without exposing it. | Disabling the feature or token disables Shopify reads as well as writes; there is no dedicated write-only kill switch today. |
| Scheduled jobs | Disable the trusted external scheduler or queue consumer. Do not use undocumented database edits to cancel jobs. | Confirm no new trigger is delivered; inspect durable `scheduled_jobs` state only through approved read access. | There is no public cancel, retry, or force-unlock control. Running work may hold its lease until completion or expiry. |
| Founder approval access | Add the compromised session ID to `FOUNDER_REVOKED_SESSION_IDS` and restart/redeploy; rotate `FOUNDER_AUTH_SECRET` if the signing secret itself may be compromised. | Confirm a new authorization check rejects the revoked/old session without publishing any token. | Secret rotation invalidates all founder sessions and requires controlled re-authentication. |

## Rollback runbook

### 1. Choose the lowest-risk recovery path

Rollback is a founder decision when it changes production behavior, schema, external access, or data retention. First disable mutation surfaces, preserve safe evidence, and determine whether the failure is limited to application code, a configuration value, a migration, or an external effect. Prefer a code/configuration rollback that remains compatible with the current schema over a destructive schema reversal.

| Condition | Preferred response | Do not do |
|---|---|---|
| New application build fails health checks but schema remains compatible | Redeploy the previously approved application commit after founder confirmation; keep migration state unchanged. | Apply a down migration merely because a code deploy failed. |
| Configuration defect exposes a risk of effects | Disable the affected integration, correct the server-side configuration, redeploy, and verify non-destructively. | Print configuration values or test by sending real email/mutating a live store. |
| Migration fails before commit/transaction completion | Stop, preserve the database error safely, and follow the database operator’s approved recovery path. | Guess schema repair commands or continue with later migrations. |
| Migration completes but release must be reversed | Evaluate the specific down migration, backup, retained-record need, and external-effect state; require founder approval. | Assume every down migration is lossless or safe after real effects occurred. |
| External effect may be ambiguous | Disable the integration, identify the governed run/tool/audit record, and reconcile with the provider using safe identifiers. | Re-submit the operation because a timeout or transport failure occurred. |

### 2. Migration-specific cautions

Run down migrations only in reverse order and only after the documented rollback preconditions have been checked:

1. `db/migrations/20260818_scheduler_reliability_down.sql` drops `scheduled_jobs` and scheduler functions. It removes durable scheduler history and must not be used while that history is required for incident review or replay protection.
2. `db/migrations/20260817_approval_consumption_down.sql` converts `consumed` approvals to `expired` before narrowing the status constraint. It loses consumed-state semantics; do not run it when approval-consumption evidence is required.
3. `db/migrations/20260815_governed_execution_down.sql` is the oldest governed-execution reversal and must be evaluated against its own data-retention implications before execution.

After any rollback, execute the same non-destructive verification set as a deployment, update the relevant release-evidence record with `Failed`, `Verified`, or `Accepted exception` as appropriate, and create a decision-log entry that names the founder decision owner and residual risk.

## Incident response runbook

### 1. Classify, contain, and preserve safe evidence

Open an incident when there is a suspected unauthorized action, credential/session compromise, repeated provider failures, persistence failure, scheduler duplication/concurrency conflict, unsafe deployment result, or unintended external effect. The first operator records the UTC start time, incident owner, service/build identifier, safe run/approval/job IDs, and current mutation posture.

| Priority | Example | Initial response | Escalation |
|---|---|---|---|
| Critical | Suspected credential compromise, unauthorized external effect, production data corruption, or mutation effect outside approval. | Disable the relevant integration immediately, preserve safe IDs/evidence, and notify the founder. | Founder decides continued containment, credential rotation, provider contact, and rollback. |
| High | Repeated provider timeouts/rate limits, execution persistence unavailable, active job lease blocking required work, or dashboard/approval control failure. | Stop affected scheduler deliveries, keep risky mutations disabled, and classify the safe error code. | Founder and integration/database owner determine recovery window and whether to roll back. |
| Medium | A single retryable provider failure with no effect, a rejected approval, or an expected duplicate delivery. | Observe durable retry/duplicate state and avoid manual replay. | Escalate if retries exhaust, safe error changes to non-retryable, or user impact grows. |
| Low | Cosmetic dashboard issue with no governance or effect impact. | Record safe details and create follow-up work. | Escalate only if it masks a higher-severity condition. |

### 2. Safe triage by signal

Use only normalized safe error codes and persisted safe identifiers. Gmail `gmail_rate_limited`, `gmail_transport_failed`, `gmail_timeout`, and `gmail_malformed_response` are retryable; `gmail_auth_failed` is not. Shopify `shopify_rate_limited`, `shopify_timeout`, `shopify_transport_failed`, and malformed responses are retryable; authentication, GraphQL, and mutation user errors are not. A provider timeout does not prove that an external effect did not occur.

For an approval concern, remember that stale, rejected, expired, malformed, or consumed approval records must fail closed. A consumed approval cannot be reused. For a scheduler concern, `duplicate` means the same idempotency key was already handled, while `concurrency_limited` means another delivery of the same job currently holds an unexpired lease. Stop the upstream scheduler and wait for a bounded, documented recovery path; do not force database state changes manually.

### 3. Closure and learning

Close an incident only after containment is verified, the service is stable, release evidence and decisions are updated, and the founder accepts any residual risk. Record the final safe classification, affected build(s), whether a rollback occurred, mutation-disablement duration, customer-impact assessment without personal data, follow-up issues, and reviewer. Keep failed evidence visible; do not rewrite history to imply a clean release.

## Operations handover

### Handover package

A qualified successor receives repository access, approved deployment-platform access, database-operator contact path, provider-admin contact path, founder escalation path, current release-evidence register, decision log, and these contracts: [`GMAIL_POLICY_CONTRACT.md`](./GMAIL_POLICY_CONTRACT.md), [`SHOPIFY_TEST_STORE_CONTRACT.md`](./SHOPIFY_TEST_STORE_CONTRACT.md), and [`SCHEDULER_RELIABILITY_CONTRACT.md`](./SCHEDULER_RELIABILITY_CONTRACT.md). Access transfer must use the organization’s identity and secret-management process; do not hand over plaintext credentials.

| Handover check | Evidence of completion |
|---|---|
| Build and test operation | Successor runs the documented local quality gate on a non-production checkout. |
| Approval and dashboard access | Successor demonstrates a valid founder-authorized inspection path without sharing a founder secret or bearer token. |
| Mutation containment | Successor explains Gmail disablement, Shopify token removal/revocation, scheduler stop, and founder-session revocation without performing live effects. |
| Migration understanding | Successor identifies fresh versus upgrade paths, migration ordering, backup prerequisite, and why down migrations are not routine deployment steps. |
| Incident exercise | Successor walks through a synthetic timeout/rate-limit scenario using safe codes and identifies the founder escalation decision. |
| Evidence discipline | Successor updates a draft evidence record without inserting secrets, raw payloads, or a false `Verified` status. |

The outgoing operator must list open incidents, disabled integrations, active release decisions, outstanding staging evidence, known limitations, and the next responsible owner. The incoming operator must acknowledge the current `Prepared but unrehearsed` posture until C5-04 and the release gates provide inspectable evidence.

## Rehearsal record

This runbook becomes operationally accepted only after a qualified operator completes a staging rehearsal covering deployment preflight, migration forward path, mutation disablement, application rollback, scheduler containment, safe provider failure triage, and handover walkthrough. Attach the result to `EV-C5-05-01`, update RC-09 only with the resulting evidence, and obtain the required founder/independent review. Until then, C5-05 remains in progress.
