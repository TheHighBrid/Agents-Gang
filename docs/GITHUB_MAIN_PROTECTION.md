# GitHub `main` Protection Specification

## Purpose

This document defines the repository-settings control required to complete C5-03. It is separate from the committed Release gate workflow.

A workflow file can prove a candidate passed checks. It cannot by itself prevent an administrator or unprotected direct push from bypassing those checks. GitHub repository rules must provide that platform enforcement.

## Target

Apply this ruleset to the repository default branch:

- branch: `main`
- enforcement: active

## Required rules

### Require a pull request before merging

Enable pull-request enforcement for ordinary development changes to `main`.

Recommended settings:

- required approvals: at least 1 when an independent reviewer is available
- dismiss stale approvals when new commits are pushed
- require conversation resolution before merge

An administrator may use the documented emergency bypass only when the normal review path is unavailable and the exception is recorded in the release evidence/decision log.

### Require status checks

After the Release gate has run successfully on `main` at least once, select the existing successful status check for the workflow job named:

`Release provenance manifest`

This is the minimum release status to require because that job depends on all six Release gate prerequisites:

- repository quality
- environment policy
- fresh schema proof
- governed-schema upgrade proof
- dependency/lockfile policy
- committed-secret policy

Do not create a similarly named custom status or choose a stale check from another workflow. Select the actual status emitted by `.github/workflows/release-gate.yml`.

Keep the existing repository quality check required as an additional defense if the platform settings allow both checks to be selected cleanly.

### Protect branch history

Enable:

- block force pushes
- block branch deletion

Do not permit routine history rewrites on `main`.

### Bypass policy

Do not configure broad organization/user bypass for ordinary work.

If an emergency administrative bypass is retained:

1. restrict it to the repository administrator role that actually needs recovery access;
2. use it only when the normal protected path is unavailable;
3. record the exact reason, candidate SHA, failed/unavailable gate, risk, and follow-up action in the release decision log;
4. do not use bypass to ignore a known failing security, migration, secret, or production-safety check.

## Evidence required for C5-03 acceptance

Capture repository-settings evidence showing:

- ruleset applies to `main`;
- enforcement is active;
- pull requests are required;
- the real `Release provenance manifest` check is required;
- force pushes are blocked;
- branch deletion is blocked;
- bypass is absent or explicitly bounded.

Record that evidence under C5-03 / RC-07 / EV-C5-03-02.

## Connector limitation

The connected GitHub administrative tool used for the Agents-Gang implementation exposes repository code, issue, pull-request, workflow-result, and merge operations, but it does not expose a branch-protection or repository-ruleset mutation.

Therefore this repository setting cannot be truthfully marked configured by the implementation agent until GitHub repository settings provide independent evidence.

Do not substitute a committed YAML workflow for this platform control.
