# Moon Relay Kernel Source Implementation Report

## Scope

This change implements the source-level contracts for phases 01 through 07 without mutating live account-root profiles. The follow-up remediation keeps the frozen audit scope, closes the highest-risk source seams, and records local verification separately from live adoption.

## Implemented

- isolated product, promotion, runtime, workflow, context, state, evidence, proof, scheduler, and upstream policies
- Kernel-only CLI and package manifest
- track-aware project-root routing and mutation hard stops
- adaptive router and state machine
- stage-scoped context compiler and deterministic receipts
- SQLite execution authority with one-way projections
- latest-obligation completion evaluation, acceptance coverage, waiver receipts, and release evidence persistence
- E0–E2 evidence packaging
- internal capability skills and managed upstream proposal flow
- T0–T3 proof routing and Safe Wave dry-run planning
- disposable Claude, Codex, and Qwen profile templates
- contained Kernel payload installer with backup, collision detection, checksum manifest, rollback, and uninstall protection
- focused Kernel contract tests and a 30-case evaluation corpus with executable route/evidence assertions

## Focused verification

```text
node --test tests/kernel-*.test.mjs
Node: v24.18.0
Result: 57 passed, 0 failed
```

The remediation run also verifies mutation revision, context prompt/receipt alignment, project-root track discovery, and the Kernel installer product boundary.

## Verification boundary

The focused suite uses only Node built-ins, including `node:sqlite`. Fresh local repository gates are now green:

- `npm test`: 667 passed, 1 skipped, 0 failed
- `npm run test:package`: 139 passed, 0 failed
- `npm run test:routing`: 22 passed, 0 failed
- `npm run test:eval`: 14/14 golden cases passed
- `npm run test:lab`: candidate smoke passed; promotion remains `smoke_only`
- disposable installed launcher E2E: accepted completion and checksum-protected uninstall passed

The remaining boundary is deliberately narrower: managed-runtime multi-version execution is not claimed here. Live account-root/provider profile adoption is intentionally out of this implementation scope and reserved for a later manual user request.

Runtime-state completion authority remains the only completion authority; local test results and lab evidence do not replace the later managed-runtime matrix or manual adoption test.
