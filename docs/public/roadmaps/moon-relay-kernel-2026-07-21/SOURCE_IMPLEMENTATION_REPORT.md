# Moon Relay Kernel Source Implementation Report

## Scope

This change implements the source-level contracts for phases 01 through 07 without mutating live account-root profiles.

## Implemented

- isolated product, promotion, runtime, workflow, context, state, evidence, proof, scheduler, and upstream policies
- Kernel-only CLI and package manifest
- adaptive router and state machine
- stage-scoped context compiler and deterministic receipts
- SQLite execution authority with one-way projections
- E0–E2 evidence packaging
- internal capability skills and managed upstream proposal flow
- T0–T3 proof routing and Safe Wave dry-run planning
- disposable Claude, Codex, and Qwen profile templates
- focused Kernel contract tests and a 30-case evaluation corpus

## Focused verification

```text
node --test tests/kernel-*.test.mjs
Node: v22.16.0
Result: 31 passed, 0 failed
```

The first focused run detected that projection verification trusted `sourceDigest` and `runtimeRevision` without comparing projected status fields. The implementation was corrected to compare `runId`, `status`, `currentState`, revision, and digest; the full focused suite then passed.

## Verification boundary

The focused suite uses only Node built-ins, including `node:sqlite`. The following repository-level gates have not run in this environment and remain blockers for whole-plan completion:

- `npm test`
- `npm run test:package`
- `npm run test:routing`
- `npm run test:eval`
- `npm run test:lab`
- package dry-run and profile-surface parity
- disposable-home install/uninstall/rollback matrix
- live account-root and provider profile adoption

No GitHub Actions status was available for the implementation commit when this report was updated. Runtime-state completion authority must remain blocked until the repository-level gates produce accepted evidence.
