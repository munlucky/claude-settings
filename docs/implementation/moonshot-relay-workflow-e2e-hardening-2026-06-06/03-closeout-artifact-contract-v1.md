# Phase 03 - Closeout Artifact Contract

## Goal

Make workflow completion machine-checkable and reproducible without relying only on Markdown QA/HANDOFF files.

## Scope

- `templates/execution/**`
- `skills/completion-verifier/**`
- `skills/verification-evidence-gate/**`
- `skills/moonshot-phase-runner/**`
- tests

## Tasks

1. Define `plan-closeout.json` or `phase-closeout.json` as the authoritative closeout artifact.
2. Keep Markdown QA/HANDOFF/SCORECARD as render/output artifacts, not the only source of truth.
3. Define non-commit `repositoryCloseout` evidence: branch, dirty status, ahead/behind, `git diff --check`, skipped checks.
4. Add plan-level closeout template separate from execution-slice templates.
5. Add profile-specific QA/HANDOFF templates or generator behavior for `platform`, `frontend`, `demo_first`, and `docs_only`.
6. Keep raw ignored execution output ignored, but track summarized closeout manifests.

## Acceptance

- Completion can be checked from a structured closeout artifact.
- Placeholder Markdown cannot produce a clean pass.
- Commitless closeout is distinct from `$commit-moonshot`.
