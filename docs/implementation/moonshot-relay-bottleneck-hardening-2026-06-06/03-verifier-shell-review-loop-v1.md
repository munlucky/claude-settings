# 03 Verifier Shell Review Loop v1

## Goal

Reduce repeated operator mistakes and review wait loops without replacing deterministic verifier gates.

## Owned Paths

- `tests/harness-regression-contract.test.mjs`
- `archive/scripts/legacy-phase-adapters/verify-shell-syntax.mjs`
- `archive/scripts/legacy-phase-adapters/verify-shell-syntax.test.mjs`
- `scripts/lib/failure-classifier.mjs`
- `skills/moonshot-plan-writer/references/independent-review-loop.md`

## Work

- Add an active regression that invokes archive `verify-plan-conformance` by explicit path and confirms plan-level options exit 64 with alternatives.
- Diagnose PowerShell here-doc and ParserError text as `powershell_command_syntax`.
- Classify PowerShell parser/range/quoting mistakes as `operator_error` with `fix_command`.
- Record review-loop caps in the independent review reference.

## Acceptance

- Verifier misuse test passes.
- PowerShell syntax diagnostics test passes.
- Failure classifier maps ParserError-like text to operator command error.
- Review-loop rules cap first pass at three perspectives and re-review at one blocker-confirmation pass.
