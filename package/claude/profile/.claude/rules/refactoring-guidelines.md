# Refactoring Guidelines

Use phased refactoring to reduce regression risk.

## Before Refactoring

- Define phase boundaries and target files.
- Capture baseline verification results.

## During Refactoring

- Complete one phase at a time.
- Run relevant verification after each phase (`build`, `typecheck`, or script checks).
- Record only newly introduced failures as regressions.

## After Refactoring

- Run final verification across changed scope.
- Compare with baseline and document delta.
- Keep rollback path clear (small commits and isolated changes).

## Multi-Module Changes

- Split independent modules/tasks where possible.
- Avoid cross-module edits in a single step unless required.
