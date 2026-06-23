# Phase 03 - Contract Engine and Spec Revision v1

## Objective

Introduce the task contract layer for `spec.yaml`, `done.yaml`, spec revisions, ambiguity status, and automatic invalidation.

## Dependencies

- Phase 01.
- Phase 02.

## Owned Paths

- `schemas/task-contract.schema.json`
- `schemas/done-contract.schema.json`
- `schemas/spec-revision.schema.json`
- `scripts/contract-engine.mjs`
- `scripts/lib/contract-invalidation.mjs`
- `templates/SPEC.template.yaml`
- `templates/DONE.template.yaml`
- `tests/contract-engine-contract.test.mjs`
- `tests/spec-revision-contract.test.mjs`

## Read-only Paths

- `skills/moonshot-plan-writer/**`
- `skills/moonshot-orchestrator/**`
- `skills/moonshot-phase-runner/**`
- `docs/public/guidelines/requirements-traceability-harness.md`

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P03-1 | Define spec/done schema vocabulary and revision metadata. | Schema and templates |
| P03-2 | Add ambiguity classification rules based on unresolved constraints and acceptance coverage. | Contract validation helper |
| P03-3 | Implement invalidation rules for spec, done, design, plan, source, lockfile, and policy changes. | Invalidation engine |
| P03-4 | Wire plan writer/orchestrator docs to require frozen contract before implementation. | Skill/doc updates |

## Acceptance Criteria

- Frozen contract changes require a new revision instead of silent overwrite.
- Plan/run/review/verify/score/submission evidence is invalidated according to the master plan table.
- Ambiguity remains typed metadata, not an ungrounded LLM score.
- Waiver misuse and forward state movement without revision/event evidence are rejected by negative tests.

## Verification Signals

- Contract engine tests for revision and invalidation.
- Plan package tests proving plan writer cannot mark missing contracts execution-ready.
- `npm test`

## Review-Improvement Loop

- Review focus: hidden forward state movement, force/waiver bypass, unclear ambiguity semantics.
- Re-review trigger: any feature that can advance state without a new event or revision.

## Phase 03 Closeout

Status: complete

Completion evidence:

- `schemas/task-contract.schema.json`
- `schemas/done-contract.schema.json`
- `schemas/spec-revision.schema.json`
- `scripts/contract-engine.mjs`
- `scripts/lib/contract-invalidation.mjs`
- `templates/SPEC.template.yaml`
- `templates/DONE.template.yaml`
- `tests/contract-engine-contract.test.mjs`
- `tests/spec-revision-contract.test.mjs`
- `execution/phase-03/SCORECARD.md`
- `execution/phase-03/QA_REPORT.md`
- `execution/phase-03/HANDOFF.md`

Execution decision:

- Phase 04 may use contract revisions and invalidation rules to build fresh review bundles.
- Stale forward state movement without matching revision or waiver is rejected by tests.
