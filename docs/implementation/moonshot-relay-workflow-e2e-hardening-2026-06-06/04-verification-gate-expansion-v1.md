# Phase 04 - Verification Gate Expansion

## Goal

Strengthen default gates so passing tests cover syntax, schema, dry-run shape, and workflow-warning failure modes.

## Scope

- `package.json`
- `tests/**`
- `schemas/**`
- active shell and PowerShell files
- `agents/verification/**`

## Tasks

1. Fix README direct test guidance so active tests do not accidentally run legacy archive tests.
2. Add schema parse/meta-validation for YAML/JSON contracts.
3. Add maintained `.mjs` `node --check`, active shell `bash -n`, and `.ps1` parser checks to an active syntax lane.
4. Add package dry-run JSON schema/critical-entry/prohibited-target assertions.
5. Add `verify-changes.sh` or verdict builder fixtures proving workflow warnings, missing review/finish bundle, missing score, and blocking defects cannot clean-pass.
6. Classify Git Bash/MSYS browser-flow skip as either intentional platform-only coverage or add a non-MSYS equivalent smoke.

## Acceptance

- Default or documented active gate catches broken active script syntax.
- Contract YAML/JSON syntax breakage cannot pass through regex-only tests.
- Workflow-warning verdicts are executable regression fixtures.
