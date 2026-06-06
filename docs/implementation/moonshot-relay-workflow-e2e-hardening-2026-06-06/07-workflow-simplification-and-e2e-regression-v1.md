# Phase 07 - Workflow Simplification And E2E Regression

## Goal

Reduce repeated operational friction while adding one synthetic E2E workflow test that proves the harness process can complete.

## Scope

- workflow registry/rules
- `skills/moonshot-plan-writer/**`
- `skills/commit-moonshot/**`
- `templates/execution/**`
- docs and tests

## Tasks

1. Add a synthetic fixture for `discover -> plan -> review -> prepare -> attempt summary -> closeout -> repository closeout`.
2. Add a minimal plan profile for read-only/docs-only/small remediation work.
3. Define reviewer evidence minimums: reviewer id/source, findings, accepted/rejected disposition, blocker re-review.
4. Generate install command snippets from one matrix or enforce one command source.
5. Add or plan a staging planner so `$commit-moonshot` does not rely on manual path filtering.
6. Add localization policy manifest instead of vague `.md`/`.ko.md` expectations.

## Acceptance

- E2E workflow smoke fails when any major bridge artifact is missing.
- Small/docs-only work can close without heavy irrelevant QA placeholders.
- Commit staging safety is backed by a deterministic plan or a documented blocker.
