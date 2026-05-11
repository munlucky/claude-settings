# Phase 04: Versioned Supersede Archive And Log Snapshot (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.7 | AC-07 | Plan v10 / Versioned Supersede Archive | Supersede uses snapshot path, commit token, and hash. | Implement archive snapshot and supersede entries. |
| REQ-1.8 | AC-08 | Plan v10 / Mutable Log Snapshot | Mutable log hash is `hashAtSnapshotTime`, not active validation authority. | Add log snapshot metadata policy. |

## Goal
- Preserve previous current artifacts as versioned history without confusing reused canonical paths with superseded current files.

## Expected Outcome
- New publishes carry previous active artifacts into `supersededArtifacts[]` as archive snapshots.
- Canonical path equality alone never invalidates current state.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-4"
  dependsOn: ["03"]
  conflictsWith: ["06", "07"]
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/lib/current-artifacts-state.mjs"
    - ".claude/scripts/lib/current-artifacts-state.test.mjs"
  readOnlyPaths:
    - ".claude/logs/workflow-enforcement/closeout-prep/**"
    - ".claude/tests/fixtures/phase-closeout/phase-08-success/**"
  sharedMutablePaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
  requiresManualEvidence: false
  mergePolicy: "coordinate_shared_finalizer_patch"
```

## Scope
- Included:
  - `closeout-archive/<oldCommitToken>/` tentative snapshot.
  - Supersede entries with `canonicalPath`, `snapshotPath`, `artifactHash`, `commitToken`, and `supersededByCommitToken`.
  - `orphaned_prepare_archive` diagnostic.
  - Log snapshot policy using full hash at snapshot time plus 64KB tail.
- Excluded:
  - Cleanup scheduler for old archive directories.
  - Full log copy by default.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Snapshot previous current | Before publish, copy previous active non-log artifacts to `closeout-archive/<oldCommitToken>/`. | Snapshot failure stops publish before canonical writes. |
| P04-2 | Build supersede entries | Add snapshot metadata to next `current-artifacts.json.supersededArtifacts[]`. | Previous active artifacts are preserved by versioned snapshot/hash. |
| P04-3 | Add log snapshot | Store log `hashAtSnapshotTime`, `mtimeAtSnapshotTime`, `sizeBytesAtSnapshotTime`, and 64KB tail excerpt. | Append after snapshot does not invalidate current. |
| P04-4 | Handle orphan archive | If publish fails after tentative archive, record `orphaned_prepare_archive`. | Archive presence alone is not superseded state. |

## Exact Execution Targets
| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|----|--------------|--------------|------------|---------|---------------------------|
| P04-1 | none | `.claude/scripts/phase-closeout-finalize.mjs` | finalizer archive tests | `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs` | archive snapshot failure blocks publish. |
| P04-2 | none | `.claude/scripts/lib/current-artifacts-state.mjs` | helper tests | `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/lib/current-artifacts-state.test.mjs` | same canonical path with different hash/token is valid. |
| P04-3 | none | `.claude/scripts/phase-closeout-finalize.mjs` | log snapshot tests | `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs` | appended log does not cause active hash invalidation. |

## Critical Product Scenarios
| Scenario | User-visible Expectation | Proof Command | Expected Pass Signal | Evidence Path |
|----------|--------------------------|---------------|----------------------|---------------|
| SCN-07 | Previous QA/HANDOFF/SCORECARD content remains inspectable after overwrite. | archive snapshot test | snapshot file exists and hash matches old content. | finalizer test output |
| SCN-08 | Reused canonical path does not invalidate current. | helper test | canonical path reuse case passes. | helper test output |

## Blockers And Review
- Blocker condition: supersede entries only store canonical paths without snapshot hashes.
- First review checkpoint: archive entry schema review.
- Verification evidence path: archive and helper test outputs.

## Validation Plan
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/lib/current-artifacts-state.test.mjs`
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs`

## Deliverables
- Versioned archive snapshot implementation.
- Supersede entry generation.
- Mutable log snapshot handling.

## Phase Completion Checklist
- [ ] Supersede uses snapshot/hash, not path equality.
- [ ] Tentative archive is not superseded until current index publish.
- [ ] Mutable log append does not invalidate current.
