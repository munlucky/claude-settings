# Skill Architecture Rework Change Package

Last-Reviewed: 2026-03-27

## Status

Documentation and skill-metadata passes completed.
No script or runtime dispatch rewrite was required.

## First Implementation Pass

Goal:
- make the architecture legible without changing major execution semantics

File targets:
- `.claude/docs/guidelines/skill-composition.md`
- `.claude/docs/tasks/skill-architecture-rework/*`
- `README.md` only if entrypoint documentation must be aligned
- selected `SKILL.md` files where entrypoint visibility or internal-only status needs to be declared

Allowed changes:
- fix stale references
- declare public entrypoints explicitly
- mark internal-only execution boundaries
- update bundle definitions to match actual assets
- add deprecation or consolidation notes

Disallowed in pass 1:
- deleting skills or agents
- mass renaming
- changing script entry behavior
- changing installer behavior
- altering verification strictness defaults

## Planned Sequence

### Step 1. Reconcile Bundles

Do:
- remove or replace missing bundle references such as `code-simplifier`
- align bundle names and current assets

Validate:
- every bundle references existing assets only

### Step 2. Declare Entrypoint Policy

Do:
- document that only three public entrypoints are expected:
  - `product-orchestrator`
  - `moonshot-phase-runner`
  - `moonshot-orchestrator`

Validate:
- no documentation implies conflicting default entrypoints for large work

### Step 3. Hide Internal Surfaces

Do:
- mark `moonshot-phase-executor` and similar helpers as internal boundaries
- mark analysis micro-skills as orchestrator-internal

Validate:
- user-facing docs emphasize Tier 1 entrypoints first

### Step 4. Prepare Consolidation Notes

Do:
- add explicit consolidation notes for:
  - analysis cluster
  - doc-ops cluster
  - UI/design helper cluster
  - verification helper cluster

Validate:
- each candidate has a destination path and a non-destructive migration note

## Rollback Boundaries

Rollback-safe scope for pass 1:
- documentation files
- bundle metadata
- comments or declarations inside skill docs

Not rollback-safe without extra review:
- runtime scripts
- agent routing logic
- execution-mode defaults

## Success Criteria

Pass 1 succeeds when:
- entrypoint policy is unambiguous
- bundle drift is removed or explicitly annotated
- internal-only components are documented as such
- no runtime behavior changes are required to accept the documentation pass

## Completed Passes

- Pass 1: entrypoint policy and bundle drift cleanup
- Pass 2: analysis/doc-ops/verification cluster alignment
- Pass 3: deprecated/non-default marking and trigger tightening
