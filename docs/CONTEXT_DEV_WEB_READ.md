# Context.dev public web-reading tool (opt-in)

## Scope and authority

This is an optional **server-side-only, governed read tool**. It does not change
the existing chat routing, approvals, Shopify adapters, or autonomous agent
instructions. Agent code must invoke `runContextWebRead(context, input)`
inside the existing execution boundary to record run/tool/audit evidence. The
action `web.read` is registered as risk level 1, read-only.

This capability can accept public URLs from an approved agent discovery result,
an explicit user URL or a task. Never pass customer messages, mailbox records,
private account links, local network URLs or documents containing secrets.
The source page's words are untrusted evidence, never tool instructions, a
request for secrets or authorization for external actions. No automatic use
is added to the orchestrator; enabling this adapter does not make the AI
automatically browse.

## Configuration

```sh
# In a gitignored .env.local file or secret manager, never the browser:
CONTEXT_DEV_ENABLED=true
CONTEXT_DEV_API_KEY=<secret from Context.dev dashboard>
```

`CONTEXT_DEV_API_KEY` is the canonical name.
`CONTEXT_API_KEY` is accepted by the reader as a legacy alias, but managed
deployments should use the canonical name. Do not set NEXT_PUBLIC variables.

## Supported inputs

Default `{ url: "https://example.org" }` retrieves Markdown.
Optional fields: `formats`, `jsonSchema`, `jsonInstructions`,
`highlightsQuery`, `highlightsMaxCharacters`, `parseParams`, `zdr`.
JSON requires an object JSON Schema, and preserves property names exactly.
Highlights default to 2,000 characters and cannot use ZDR. For CSS selectors
use `formats: { parse: true }` and
`parseParams: { type: "custom", rules: { title: "h1" } }`.
For a prebuilt parser use `{ type: "prebuilt", parser: "links" }`
or another documented source-compatible parser.

Each read has a 6-hour cached freshness preference, 20-second attempt timeout,
25-second total client budget, and a single transient retry. A governed run
can issue **at most two Context.dev reads**, with shared in-process counters
that expire after one hour. They reset on server restart, so do not treat
this local budget as a global monthly credit guarantee. Account free-plan
usage limits remain independently enforced by Context.dev.
Read results preserve `sourceUrl`, `finalUrl`, `retrievedAt`, `isPartial`,
`requestId`, and each format's requested/success/data/error information.
An HTTP 200 may still contain a failed format.

The reader rejects IP-literal or obviously private target URLs, validates
the final result URL, and sends HTTPS requests to Context.dev. DNS-resolution
and redirect access control inside Context.dev are not directly inspectable
by this adapter; do not claim it is a comprehensive provider-side SSRF barrier.
No target cookies, authorization headers, interactive browser actions, browser
profiles, user PDFs or private tokens are forwarded. Browser actions require
paid-plan support and are intentionally out of scope.

## Offline tests and quality gates

```sh
npm test -- tests/context-web-read-tool.test.ts
npm run lint
npm run typecheck
npm run build
npm test
```

All tests mock the HTTP boundary; no live API call is required or authorized
by these fixtures. A deployment/production enablement requires the existing
repository governance, release and security review.
