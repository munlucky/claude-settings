# Phase 02: Dry-Run And Diagnostics Contract (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.3 | AC-03 | Plan v10 / Dry-Run Write Policy | Dry-run writes no files unless `--keep-prep` is set. | Update finalizer dry-run output contract. |
| REQ-1.4 | AC-04 | Plan v10 / Diagnostics Ledger | Closeout diagnostics go to `closeout-diagnostics.jsonl` with fallback. | Add diagnostic writer and failure fallback. |

## Goal
- Make dry-run and diagnostics behavior deterministic before publish semantics change.

## Expected Outcome
- `--dry-run` is memory-only by default.
- `--dry-run --keep-prep` writes prep candidates but never current state.
- closeout diagnostic events have one ledger path and a non-blocking fallback.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn: ["01"]
  conflictsWith: ["03", "06"]
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/lib/closeout-diagnostics.mjs"
    - ".claude/scripts/lib/closeout-diagnostics.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/current-artifacts-state.mjs"
    - ".claude/tests/fixtures/phase-closeout/phase-08-success/**"
  sharedMutablePaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
  requiresManualEvidence: false
  mergePolicy: "coordinate_shared_finalizer_patch"
```

## Scope
- Included:
  - `--dry-run` memory-only output.
  - `--keep-prep` candidate file opt-in.
  - `closeout-diagnostics.jsonl` append helper.
  - stderr/phase-log fallback when diagnostics append fails.
- Excluded:
  - Actual publish order changes.
  - Supersede archive behavior.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Add diagnostics helper | Create `.claude/scripts/lib/closeout-diagnostics.mjs` with append JSONL and fallback emission. | Append failure does not throw into current verdict flow. |
| P02-2 | Update dry-run output | Add `wouldPublishCurrentArtifacts`, `wouldArchiveSupersededArtifacts`, `plannedWrites[]`, `plannedManifestHash`, and `publishBlockedBy[]`. | Dry-run JSON shape is stable and tested. |
| P02-3 | Add `--keep-prep` | Parse option and write prep candidates only when explicitly set. | Plain dry-run leaves no prep/canonical/current/archive files. |

## Exact Execution Targets
| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|----|--------------|--------------|------------|---------|---------------------------|
| P02-1 | `.claude/scripts/lib/closeout-diagnostics.mjs` | none | `.claude/scripts/lib/closeout-diagnostics.test.mjs` | `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/lib/closeout-diagnostics.test.mjs` | diagnostic append and fallback cases pass. |
| P02-2 | none | `.claude/scripts/phase-closeout-finalize.mjs` | finalizer tests or fixture dry-run test | `node .claude/scripts/phase-closeout-finalize.mjs finalize --phase 8 --plan-dir .claude/tests/fixtures/phase-closeout/phase-08-success/docs/implementation --master-plan .claude/tests/fixtures/phase-closeout/phase-08-success/docs/implementation/MASTER_PLAN.md --execution-root .claude/tests/fixtures/phase-closeout/phase-08-success/execution --status-file .claude/tests/fixtures/phase-closeout/phase-08-success/docs/phase-status.yaml --dry-run --json` | JSON includes planned fields and no files are written. |

## Critical Product Scenarios
| Scenario | User-visible Expectation | Proof Command | Expected Pass Signal | Evidence Path |
|----------|--------------------------|---------------|----------------------|---------------|
| SCN-03 | Dry-run can be used safely before mutation. | fixture-backed dry-run command | `dryRun: true`, `plannedWrites`, no current publish. | dry-run JSON output |
| SCN-04 | Diagnostic ledger failure does not break current verdict. | diagnostics test | fallback event emitted. | diagnostics test output |

## Blockers And Review
- Blocker condition: plain `--dry-run` creates files outside temp/test output.
- First review checkpoint: dry-run JSON contract review.
- Verification evidence path: dry-run JSON saved in phase QA evidence.

## Validation Plan
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/lib/closeout-diagnostics.test.mjs`
- [ ] fixture-backed dry-run command
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs`

## Deliverables
- Diagnostics helper and tests.
- Updated finalizer dry-run contract.

## Phase Completion Checklist
- [ ] Plain dry-run writes no prep/current files.
- [ ] `--keep-prep` behavior is opt-in and documented in tests.
- [ ] Diagnostic append failure has fallback evidence.
