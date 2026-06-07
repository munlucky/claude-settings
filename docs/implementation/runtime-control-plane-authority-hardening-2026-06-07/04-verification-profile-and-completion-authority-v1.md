# Phase 04 - Verification Profile And Completion Authority

## Goal

Introduce verification profiles without weakening accepted completion authority.

## Dependencies

- Phase 01 closeout model.
- Phase 03 blocker lifecycle.

## Owned Paths

- `scripts/verification-plane.mjs`
- `scripts/lib/verification-plane.mjs`
- `scripts/lib/runtime-state-store.mjs`
- `schemas/verification.contract.yaml`
- `skills/completion-verifier/SKILL.md`
- `docs/public/runtime-control-plane.md`
- `docs/public/guidelines/verification-contract.md`
- `tests/verification-plane-contract.test.mjs`
- `tests/completion-authority-contract.test.mjs`

## Read-Only Paths

- live account-root state
- generated verifier artifacts outside test temp roots

## Required Decisions

- Split `profileRequiredPlanes` from `completionAuthorityRequiredPlanes`.
- `profileRequiredPlanes` are task-scope evidence summary requirements.
- `completionAuthorityRequiredPlanes` are the canonical accepted completion requirements: `unit`, `package`, `installer`, `browser`, `security`, `quality`.
- `--required-planes-json` may override summary evaluation only; it cannot weaken completion authority.
- Unknown profile must fail fast.

## Verification Profiles

| Profile | profileRequiredPlanes | Can produce accepted completion alone? |
| --- | --- | --- |
| `prompt_only` | `quality` | no |
| `docs_only` | `package`, `quality` | no |
| `script_change` | `unit`, `quality` | no |
| `workflow_core` | `unit`, `package`, `installer`, `security`, `quality` | no, browser still needed for final accepted authority unless explicitly not applicable through a reviewed authority rule |
| `runtime_adapter` | `unit`, `package`, `installer`, `browser`, `security`, `quality` | yes, when all completion blockers are absent |

## Implementation Notes

- Summary payload should include `profile`, `profileRequiredPlanes`, `completionAuthorityRequiredPlanes`, `missingProfilePlanes`, and `missingCompletionAuthorityPlanes`.
- `assessCompletionAuthority` must not trust a lowered `requiredPlanes` payload as completion authority.
- If retaining legacy `requiredPlanes`, treat it as a summary alias and document the migration behavior.

## Acceptance Evidence

- `docs_only` with package and quality evidence records a passed summary but `assess-completion` rejects missing authority planes.
- `prompt_only` with quality evidence records a summary but cannot produce accepted completion.
- `--required-planes-json ["quality"]` cannot produce accepted completion.
- Unknown profile exits non-zero with a typed error.
- Full authority evidence can still produce accepted completion when identity, freshness, blocker, eval, and security requirements pass.
