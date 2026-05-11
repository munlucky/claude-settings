# Phase 01: Current Artifacts Reader And Fixtures (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.1 | AC-01 | Plan v10 / First Slice Scope | `current-artifacts.json` is the only current source. | Add helper and migrate primary readers. |
| REQ-1.2 | AC-02 | Plan v10 / Current Artifacts Helper | Hash, commit token, path existence, and scan behavior are centralized. | Implement one helper and forbid reader-local validation. |

## Goal
- Establish the single current source contract before any publish mutation work begins.

## Expected Outcome
- `verification-verdict-state.mjs`, `verify-phase-closeout.mjs`, and `workflow-enforcement.mjs` read current state through one helper.
- A latest canonical verdict file is ignored unless `current-artifacts.json` points to the same commit token and manifest hash.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith: ["02", "03", "04", "08"]
  ownedPaths:
    - ".claude/scripts/lib/current-artifacts-state.mjs"
    - ".claude/scripts/lib/current-artifacts-state.test.mjs"
    - ".claude/tests/fixtures/phase-closeout/**"
    - ".claude/scripts/verification-verdict-state.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
  readOnlyPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/write-verification-verdict.py"
    - "docs/implementation/harness-closeout-state-invariant-2026-05-11/00-master-plan-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_reader_migration"
```

## Scope
- Included:
  - Fixture tree for phase-closeout current-source tests.
  - Raw bytes SHA-256 utility colocated with the helper or exported from the helper.
  - `readCurrentArtifacts({ mode })`, `validateCurrentArtifactsIndex(index)`, and normalized result contract.
  - Index-first migration for the three primary readers.
- Excluded:
  - Staged publish implementation.
  - Authoritative identity hardening.
  - Goal runtime sidecar.
  - Artifact projection guard.

## Preconditions And Inputs
- Required plan: `docs/implementation/harness-closeout-state-invariant-2026-05-11/00-master-plan-v1.md`
- Existing scripts must be readable:
  - `.claude/scripts/verification-verdict-state.mjs`
  - `.claude/scripts/verify-phase-closeout.mjs`
  - `.claude/scripts/workflow-enforcement.mjs`

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Create fixtures | Create `.claude/tests/fixtures/phase-closeout/phase-08-success/` with current index, immutable manifest, canonical verdict, stale newer canonical verdict, QA/SCORECARD/HANDOFF/WORKSETS, active log sample. | Fixture can prove current index missing, stale canonical ignored, manifest hash mismatch, and legacy scan behavior. |
| P01-2 | Implement helper | Add `.claude/scripts/lib/current-artifacts-state.mjs`; implement raw bytes SHA-256, `readCurrentArtifacts`, `validateCurrentArtifactsIndex`, and legacy/history scan result normalization. | Helper returns exact result objects and never throws for expected missing/invalid current states. |
| P01-3 | Migrate readers | Replace scan-first current verdict logic in `verification-verdict-state.mjs`, `verify-phase-closeout.mjs`, and `workflow-enforcement.mjs` with helper calls. | All three readers use helper for current mode and only scan in legacy/history mode. |
| P01-4 | Add tests | Add helper and reader regression tests for missing index, stale canonical ignored, manifest mismatch, and `isCurrent:false` legacy scan. | Tests fail before migration and pass after migration. |

## Exact Execution Targets
| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|----|--------------|--------------|------------|---------|---------------------------|
| P01-1 | `.claude/tests/fixtures/phase-closeout/phase-08-success/**` | none | `.claude/scripts/lib/current-artifacts-state.test.mjs` | `node --test .claude/scripts/lib/current-artifacts-state.test.mjs` | Before helper: module not found. After helper: fixture cases pass. |
| P01-2 | `.claude/scripts/lib/current-artifacts-state.mjs` | none | `.claude/scripts/lib/current-artifacts-state.test.mjs` | `node --test .claude/scripts/lib/current-artifacts-state.test.mjs` | `current_index_missing`, `manifest_hash_mismatch`, `legacy_scan` cases pass. |
| P01-3 | none | `.claude/scripts/verification-verdict-state.mjs`, `.claude/scripts/verify-phase-closeout.mjs`, `.claude/scripts/workflow-enforcement.mjs` | Existing and new reader tests | `node --test .claude/scripts/*.test.mjs` | No scan-first current regression. |

## Critical Product Scenarios
| Scenario | User-visible Expectation | Proof Command | Expected Pass Signal | Evidence Path |
|----------|--------------------------|---------------|----------------------|---------------|
| SCN-01 | A stale newer canonical verdict is not treated as current. | `node --test .claude/scripts/lib/current-artifacts-state.test.mjs` | stale canonical ignored test passes. | `.claude/scripts/lib/current-artifacts-state.test.mjs` output |
| SCN-02 | Missing current index fails in current mode rather than silently scanning. | `node --test .claude/scripts/lib/current-artifacts-state.test.mjs` | `current_index_missing` case passes. | `.claude/scripts/lib/current-artifacts-state.test.mjs` output |

## Blockers And Review
- Blocker condition: any primary reader still performs scan-first current verdict selection in current mode.
- First review checkpoint: after helper tests pass but before reader migration lands.
- Re-review trigger: helper result contract changes.
- Verification evidence path: phase execution `QA_REPORT.md` and test output.

## Validation Plan
- [ ] `node --test .claude/scripts/lib/current-artifacts-state.test.mjs`
- [ ] `node --test .claude/scripts/*.test.mjs`
- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`

## Deliverables
- `.claude/scripts/lib/current-artifacts-state.mjs`
- `.claude/scripts/lib/current-artifacts-state.test.mjs`
- `.claude/tests/fixtures/phase-closeout/phase-08-success/**`
- Updated primary readers.

## Phase Completion Checklist
- [ ] Fixture tree exists and covers all first-slice cases.
- [ ] Helper centralizes current validation.
- [ ] Three primary readers are index-first.
- [ ] Tests prove stale canonical files are ignored.

## Handoff Notes
- Do not start Phase 03 until this phase is complete. Publish atomicity depends on reader correctness.
