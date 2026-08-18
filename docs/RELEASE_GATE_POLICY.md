# Release Gate and Supply-Chain Policy

## Release candidate rule

Agents-Gang does not treat a green feature pull request as a production release candidate. A candidate must pass the independent `.github/workflows/release-gate.yml` workflow, which re-executes the required release proofs against the candidate commit.

The release gate has read-only repository permissions and no deployment permission. Passing it creates evidence; it does not deploy production.

## Required release jobs

A release provenance manifest is generated only after all of these jobs succeed:

1. `repository-quality`
   - exact lockfile install with `npm ci`
   - lint
   - TypeScript typecheck
   - production build
   - full Vitest suite
2. `environment-policy`
   - managed staging configuration validation
   - disabled-feature isolation
   - fail-closed diagnostic redaction
3. `migration-fresh`
   - fresh PostgreSQL schema application
   - non-destructive catalog verification
4. `migration-upgrade`
   - upgrade from the known governed-execution baseline
   - retained-data check
   - final catalog verification
5. `dependency-policy`
   - exact lockfile install
   - package/lockfile reconciliation
   - immutable GitHub Actions ref policy
   - `npm audit --audit-level=high`
6. `secret-policy`
   - tracked-file committed secret scan
   - immutable workflow-action ref verification

`release-manifest` depends on all six jobs. It cannot execute successfully if any required release job fails or is skipped by dependency failure.

## Candidate identity

For a pull request, Release gate is validation evidence only. Its generated manifest is not release eligible.

For a push to `main` or an explicit workflow dispatch, the provenance job verifies that the checked-out candidate commit is the current `main` commit before generating promotable evidence. The manifest records the full candidate SHA.

A manual workflow dispatch may name a commit SHA, but that SHA does not become release eligible unless it equals current `main` and the workflow was launched from `main`.

## Provenance retention

The release manifest records SHA-256 digests for:

- `package.json`
- `package-lock.json`
- `db/schema.sql`
- `db/verify.sql`
- every committed database migration
- every committed GitHub Actions workflow

It also records:

- full candidate commit SHA
- workflow run ID
- workflow event and ref
- Node runtime version
- required release gate names
- release eligibility

GitHub retains the manifest artifact for 90 days. The manifest contains no credentials, environment values, request payloads, provider responses, or customer data.

## Dependency policy

`package-lock.json` is mandatory and is the installation authority for CI and release validation. The supply-chain checker requires:

- lockfile version 3 or newer
- root package name/version alignment
- runtime dependency alignment between `package.json` and the lockfile root
- development dependency alignment between `package.json` and the lockfile root

Release validation runs `npm ci` before analysis. A lockfile mismatch therefore fails before release evidence is produced.

The release gate runs `npm audit --audit-level=high`. A high or critical npm advisory blocks the release candidate until the dependency is updated, removed, or a documented security exception is accepted through the release decision process.

Dependabot is configured weekly for npm and GitHub Actions updates so immutable pins and dependencies can be refreshed through reviewed pull requests.

## GitHub Actions supply-chain policy

All external `uses:` references in `.github/workflows` must resolve to a full 40-character commit SHA. Floating tags such as `@v4`, branch names, and short SHAs are rejected by `scripts/check-supply-chain.mjs`.

Official actions currently used by the repository are pinned to the resolved immutable commits behind their reviewed release lines. Dependabot is responsible for proposing future pin updates.

Local actions and `docker://` references are outside the external action-ref check and require separate review if introduced.

## Committed secret policy

`scripts/scan-secrets.mjs` enumerates tracked files with `git ls-files` and checks high-confidence credential signatures, including Anthropic, Shopify, GitHub, AWS access keys, and private-key headers.

The scanner reports only path, line, and rule name. It never includes the matched credential value in findings.

Tracked `.env` files are rejected except `.env.example`. `.env.example` must continue to use placeholders.

This scanner supplements, but does not replace, GitHub platform secret scanning if the repository account supports it.

## Workflow permissions

Release gate and supporting validation workflows use `contents: read`. They do not request write access to repository contents, packages, deployments, pull requests, issues, or actions.

The release gate does not accept production credentials and does not perform a production mutation.

## Platform branch-protection requirement

Repository-level branch protection or a repository ruleset is a separate control from the committed release workflow.

The target platform policy for `main` is:

- require pull requests before merge for ordinary development changes;
- require the release/quality status checks selected by the repository administrator;
- prevent deletion and non-fast-forward force updates to `main`;
- restrict bypass to an explicitly governed administrative emergency path;
- retain an auditable exception record when a bypass is used.

At minimum, any platform configuration used as a production release gate should require the successful `Release provenance manifest` job, because that job depends on all six release checks.

A committed workflow file does **not** prove that branch protection or a ruleset is enabled. Platform enforcement must have separate repository-settings evidence before C5-03 can be represented as fully enforced at the GitHub branch level.

## Release exception policy

The release workflow itself must not be edited to bypass a failing gate for a one-off release.

If a security or release exception is genuinely required, record:

- failed gate and exact finding;
- risk owner;
- why remediation cannot precede release;
- bounded exception scope;
- rollback/mitigation;
- expiry or follow-up task;
- founder authorization where required.

C5-06 remains the final founder-authorized go/no-go and production deployment step. A green Release gate is necessary evidence, not independent authorization to deploy.
