# Founder Session Issuance

This is the approved local mechanism for issuing a short-lived signed founder session for staging and controlled founder UAT.

## Security boundary

- Never paste `FOUNDER_AUTH_SECRET` into ChatGPT, GitHub issues, screenshots, browser fields, command-line arguments, or release evidence.
- The issuer accepts the secret only from the local `FOUNDER_AUTH_SECRET` environment variable.
- The issued bearer token is sensitive. Paste it only into the protected founder session field or an authorized HTTP client.
- Do not capture the token in screenshots or evidence.
- Sessions are founder-only, expire after 15 minutes by default, and may not exceed 60 minutes.
- Each session receives a random session ID so it can be revoked through `FOUNDER_REVOKED_SESSION_IDS` if necessary.

## Preconditions

Use a trusted local shell with Node.js and the exact repository commit under UAT. The local secret must match the `FOUNDER_AUTH_SECRET` configured for that staging deployment.

Do not retrieve or transmit the secret through an application endpoint. If the staging secret is no longer available to the founder, rotate it in the managed environment and redeploy before issuing a new session.

## POSIX / Termux / Linux procedure

From the repository root:

```bash
read -s -p "Founder auth secret: " FOUNDER_AUTH_SECRET
echo
export FOUNDER_AUTH_SECRET
npm run founder:session -- --subject founder-uat
unset FOUNDER_AUTH_SECRET
```

`read -s` prevents the secret from being echoed to the terminal and avoids putting the secret value into shell history.

The command prints one `v1...` bearer token. Copy that token directly into the staging `/dashboard` or `/approvals` founder-session field. Clear the clipboard after the UAT step.

To request a shorter lifetime, for example 10 minutes:

```bash
npm run founder:session -- --subject founder-uat --ttl-seconds 600
```

Do not use `--secret`. The command intentionally rejects secret command-line arguments.

## Verification

Before using the token for any founder decision:

1. Open `/dashboard` with no session and confirm protected telemetry is not loaded.
2. Use the newly issued token and confirm the protected dashboard loads persisted staging state.
3. Confirm the same token can access `/approvals`.
4. Do not perform production mutations. C5-04 uses staging fixtures only.
5. After UAT, let the short-lived token expire or add its session ID to `FOUNDER_REVOKED_SESSION_IDS` and redeploy if immediate revocation is required.

## Evidence rules

Record only:

- exact commit SHA;
- staging environment classification;
- UTC execution time;
- safe operator identifier;
- pass/fail outcome;
- redacted screenshots with the session field empty.

Never record the bearer token, HMAC signature, founder auth secret, Supabase service-role key, or protected raw payloads.
