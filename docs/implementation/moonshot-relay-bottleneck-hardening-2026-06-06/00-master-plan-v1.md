# Moonshot Relay Bottleneck Hardening Master Plan v1

> Superseded: `00-master-plan-v2.md` is the authoritative executable plan for the current 9-bundle hardening scope. This v1 file is retained as historical planning context only.

## Objective

Prevent recurrence of recent Codex/Moonshot Relay bottlenecks by hardening the active test gate, archive boundary, canonical path contract, verifier misuse handling, PowerShell operator-error classification, and independent review loop limits.

## Phases

1. `01-test-and-package-contract-v1.md`: make `npm test` the explicit active gate and preserve archive tests outside default discovery.
2. `02-runtime-path-and-reference-contract-v1.md`: move workflow bundle registry ownership to `rules/`, fix profile-local path wording, and resolve moonshot skill references.
3. `03-verifier-shell-review-loop-v1.md`: lock verifier misuse and PowerShell parser mistakes with regression tests, then document review-loop limits.

## Acceptance

- `npm test` passes.
- `npm run test:active` passes.
- `node --test tests/*.mjs` passes.
- Active guard tests reject archive discovery in package scripts.
- `moonshot-*` `deepReferences` resolve in source.
- PowerShell ParserError and here-doc mistakes classify as operator command errors.
- Review disposition records accepted/rejected independent review findings.

## Review Loop Policy

First-pass independent review is capped at three perspectives. A second pass is limited to blocker confirmation after accepted changes. Non-blocking findings are recorded as backlog and do not trigger another loop.
