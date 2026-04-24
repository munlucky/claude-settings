# Skill Architecture Rework Change Package

Last-Reviewed: 2026-04-24

## Status

Harness diet documentation and targeted skill-metadata pass completed.
No script, installer, or runtime dispatch rewrite was required.

## First Implementation Pass

Goal:
- make the architecture legible without changing major execution semantics

File targets:
- `.claude/docs/guidelines/skill-composition.md`
- `docs/claude-tasks/skill-architecture-rework/*`
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
- 2026-04-24 pass: surface-status taxonomy added, targeted skills marked `internal_stage_owner` / `optional_bundle_member` / `deprecated`, and open-source workflow patterns routed into the local stage model without production skill installation.

## Migration Notes

| Cluster | Decision | Destination |
|---|---|---|
| Analysis micro-skills | Keep, internalize | `analysis-bundle` behind public orchestrators |
| Phase executor/coordinator | Keep, internalize | `moonshot-phase-runner` execution boundary; delegated-terminal remains default when available |
| UI/design helpers | Keep as optional bundle members | `frontend-design` umbrella and `review-bundle` when UI review is explicitly needed |
| Browser/guided QA helpers | Keep as optional bundle members | `verification-bundle` only when runtime/browser evidence is required |
| Doc-ops helpers | Keep as optional bundle members | `finish-bundle` or `doc-ops-bundle`, with `session-logger` remaining a public utility |
| Deprecated workflow reflection | Archive, exclude from defaults | `efficiency-tracker` and `workflow-self-improver` moved under `.claude/skills-archive/deprecated/` for explicit historical/maintenance review |

## Validation Additions

Manual consistency checks for this pass:
- deprecated skills may appear in docs only as deprecated or non-default assets
- primary public entrypoints remain limited to `product-orchestrator`, `moonshot-phase-runner`, and `moonshot-orchestrator`
- bundle membership must not imply a new public entrypoint
- `.claude/scripts/**` and installer behavior remain unchanged
