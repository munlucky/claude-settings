# Harness Surface Simplification - Master Plan v1

## Source Baseline

- `schemas/verification.contract.yaml` (role: active verification contract and runtime read-model fields)
- `docs/public/runtime-control-plane.md` (role: runtime-state authority model)
- `skills/moonshot-phase-runner/**` and `skills/moonshot-in-session-coordinator/**` (role: phase runner control-plane surface)
- `skills/completion-verifier/**` (role: verification-stage prompt surface)
- `package/build-package.mjs`, `package/package-contract.yaml`, `scripts/install-account-root-harness.mjs` (role: package and account-root exposure boundary)

## Objective

Reduce Moonshot Relay's active harness surface without weakening completion, verification, package, or runtime-state gates.

## Non-Negotiables

- `runtime-state.sqlite` remains blocker, resume, run status, and whole-plan completion authority.
- `scripts/runtime-state.mjs assess-completion` accepted decisions remain the only clean whole-plan completion boundary.
- `COMPLETION_AUTHORITY_REQUIRED_PLANES` is not relaxed.
- `phase-status.yaml` remains a file name and loop cursor projection; it never becomes completion authority.
- `archive/scripts/legacy-phase-adapters/**` is preserved and not installed into active runtime profiles.
- Live account-root mutation is out of scope for implementation phases; use dry-run and temp-home evidence unless a later explicit adoption phase is approved.

## Plan Quality Loop

```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: 1
  isolationMode: forked
  maxIterations: 4
  targetAmbiguityScore: 0.20
  blockedAmbiguityScore: 0.35
  totalScore: 0.18
  ambiguityScore: 0.16
  decision: pass
  reviewerSessions:
    - point-1-legacy-archive-contract
    - point-2-phase-projection-terminology
    - point-3-task-local-completion
    - point-4-completion-verifier-surface
    - point-5-runtime-skill-surface
  writerSessions:
    - parent-plan-writer
  artifactRoot: docs/implementation/harness-surface-simplification-2026-06-08/planning-loop
  latestReview: docs/implementation/harness-surface-simplification-2026-06-08/planning-loop/plan-quality-review-iter-01.yaml
  latestWriterRevision: docs/implementation/harness-surface-simplification-2026-06-08/planning-loop/plan-writer-revision-iter-01.yaml
  blockingFindings: []
  remainingImprovementDirectives: []
  remainingOpenDecisions: []
```

## Plan Package Readiness

```yaml
planPackageReadiness:
  mode: prepared_now
  selectedMasterPlan: docs/implementation/harness-surface-simplification-2026-06-08/00-master-plan-v1.md
  selectedPhaseDocs:
    - docs/implementation/harness-surface-simplification-2026-06-08/01-legacy-archive-contract-split-v1.md
    - docs/implementation/harness-surface-simplification-2026-06-08/02-phase-projection-terminology-v1.md
    - docs/implementation/harness-surface-simplification-2026-06-08/03-task-local-completion-read-model-v1.md
    - docs/implementation/harness-surface-simplification-2026-06-08/04-completion-verifier-surface-v1.md
    - docs/implementation/harness-surface-simplification-2026-06-08/05-runtime-skill-surface-v1.md
  staleRootPhaseDocs: []
  staleMasterPlans: []
  dirtyWorktreeAction: classify_before_edit
  runtimePointerAction: none
  archiveRoot: docs/implementation/harness-surface-simplification-2026-06-08/archive/
  dryRunCommand: "node scripts/prepare-phase-runner-state.mjs --dry-run --json --plan-dir docs/implementation/harness-surface-simplification-2026-06-08 --master-plan docs/implementation/harness-surface-simplification-2026-06-08/00-master-plan-v1.md --status-file .moonshot-relay/docs/phase-status.yaml --execution-root docs/implementation/harness-surface-simplification-2026-06-08/execution"
  readinessDecision: runnable
```

## Phase Index

| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Legacy Archive Contract Split | `01-legacy-archive-contract-split-v1.md` | - |
| 02 | Phase Projection Terminology | `02-phase-projection-terminology-v1.md` | - |
| 03 | Task-Local Completion Read Model | `03-task-local-completion-read-model-v1.md` | 01, 02 |
| 04 | Completion Verifier Surface | `04-completion-verifier-surface-v1.md` | 03 |
| 05 | Runtime Skill Surface | `05-runtime-skill-surface-v1.md` | 01, 04 |

## Execution Order Notes

- Phases 01 and 02 may run in parallel because their write sets are disjoint except shared contract test files; coordinate test edits if executed concurrently.
- Phase 03 must follow Phase 01 and Phase 02 because it touches `schemas/verification.contract.yaml` after legacy command catalog removal and must use the cleaned projection terminology.
- Phase 04 depends on Phase 03 because verifier prompt wording must point at task-local versus whole-plan signals.
- Phase 05 runs last because package and installer exposure changes have the largest compatibility blast radius.

## Parallel Execution Plan

| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01, 02 | parallel | Shared tests require parent merge review. |
| wave-2 | 03 | sequential | Depends on terminology model from 02. |
| wave-3 | 04 | sequential | Depends on read-model signals from 03. |
| wave-4 | 05 | sequential | Depends on stable public/internal contract wording. |

## Source Traceability Matrix

| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|--------|---------------------|-------|-----------|--------|
| SRC-1 | User request | Split legacy command catalog from active contract | 01 | `01-legacy-archive-contract-split-v1.md` | mapped |
| SRC-2 | User request | Clarify `phase-status.yaml` as projection/cursor only | 02 | `02-phase-projection-terminology-v1.md` | mapped |
| SRC-3 | User request | Separate task-local evidence from whole-plan authority | 03 | `03-task-local-completion-read-model-v1.md` | mapped |
| SRC-4 | User request | Decompose overloaded completion-verifier prompt | 04 | `04-completion-verifier-surface-v1.md` | mapped |
| SRC-5 | User request | Reduce runtime profile skill discovery surface | 05 | `05-runtime-skill-surface-v1.md` | mapped |

## Unmapped Source Requirements

- None.

## Phase Completion Checklist

- [ ] Phase 01 - Legacy Archive Contract Split (`01-legacy-archive-contract-split-v1.md`)
- [ ] Phase 02 - Phase Projection Terminology (`02-phase-projection-terminology-v1.md`)
- [ ] Phase 03 - Task-Local Completion Read Model (`03-task-local-completion-read-model-v1.md`)
- [ ] Phase 04 - Completion Verifier Surface (`04-completion-verifier-surface-v1.md`)
- [ ] Phase 05 - Runtime Skill Surface (`05-runtime-skill-surface-v1.md`)

## Final Validation

- `npm test`
- `npm run test:package`
- `npm run test:eval`
- `node package/build-package.mjs --runtime all --dry-run --json`
- `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json`
- temp-home installer smoke for Phase 05 when implemented
- `git diff --check`

## Completion Rule

Mark a phase complete only when its phase plan evidence passes. Do not claim whole-plan clean completion from phase completion, `phase-status.yaml`, markdown reports, or verifier JSON alone. Whole-plan clean completion still requires runtime-state accepted authority after the final implementation and validation evidence exists.
