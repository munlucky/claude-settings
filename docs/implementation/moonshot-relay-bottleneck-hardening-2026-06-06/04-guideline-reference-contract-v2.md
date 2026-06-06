# 04 Guideline Reference Contract v2

## Goal

Ensure every active guideline reference resolves to source or materialized payload.

## Dependencies

- Phase 1 guard rules.

## Owned Paths

- `README.md`
- `agents/**`
- `skills/**`
- `package/profile-templates/**`
- `docs/public/guidelines/**`
- `tests/**`
- `package/package-contract.yaml`

## Work

- Inventory `.claude/docs/guidelines/*.md` references in active docs, agents, skills, and profile templates.
- Use `docs/public/guidelines/**` as the canonical source location for required human-facing guideline docs.
- Update installed profile docs to point at materialized docs derived from `docs/public/guidelines/**`, not root-local `.claude/docs/guidelines/**` source paths.
- Add required source files and include them in package/materialization.
- Replace unnecessary file references with inline summaries or remove them.
- Add a guard that referenced guideline files must exist in source or materialized payload.

## Acceptance Evidence

- Active reference existence scan reports 0 missing guideline references.
- Package materialization contains required guideline payloads when the profile docs reference them.
- `npm test` passes.

## Phase Boundary

Historical plan/evidence snapshots under unrelated `docs/implementation/**` may retain old references and must be excluded by reasoned scope, not by broad blind ignore.
