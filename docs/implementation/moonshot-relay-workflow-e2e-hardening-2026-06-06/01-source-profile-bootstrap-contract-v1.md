# Phase 01 - Source/Profile Bootstrap Contract

## Goal

Make the source checkout, installed profile, and document path authority unambiguous before any workflow execution begins.

## Scope

- `AGENTS.md`
- `README.md`
- `rules/**`
- `agents/**`
- `package/profile-templates/**`
- `schemas/analysis-context.schema.yaml`
- active contract tests

## Tasks

1. Replace source-checkout bootstrap assumptions that require root `.claude/CLAUDE.md`.
2. Add a test that `AGENTS.md` is usable in a source checkout or explicitly marked as installed-profile only.
3. Normalize `documentPaths` semantics across CLAUDE/AGENTS/PROJECT/profile-contract, or define typed overrides.
4. Replace stale `.claude/features` examples with `{tasksRoot}/{feature-name}` or a deprecated-alias note.
5. Move or package the detailed phase-runner user workflow doc, and mark slash invocation as agent UX, not CLI.

## Acceptance

- Source checkout does not require `.claude/CLAUDE.md` to load root instructions.
- `documentPaths` consistency/override test passes.
- No active source instruction presents `.claude/rules`, `.claude/features`, or `.claude/PROJECT.md` as missing canonical source without installed-profile context.
