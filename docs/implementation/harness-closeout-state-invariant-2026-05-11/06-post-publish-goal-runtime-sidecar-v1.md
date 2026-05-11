# Phase 06: Post-Publish Goal Runtime Sidecar (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.10 | AC-10 | Plan v10 / Post-Publish Sidecar | Goal runtime close is post-publish side effect. | Move goal close result to sidecar and diagnostic fallback. |

## Goal
- Keep rollback-unsafe goal runtime writes outside the artifact publish transaction.

## Expected Outcome
- Artifact publish can succeed even if goal runtime close fails.
- Goal runtime close result is discoverable in `post-publish-status-<commitToken>.json`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-4"
  dependsOn: ["03"]
  conflictsWith: ["04"]
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/lib/closeout-diagnostics.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/current-artifacts-state.mjs"
    - ".claude/runtime-state.sqlite"
  sharedMutablePaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
  requiresManualEvidence: false
  mergePolicy: "coordinate_shared_finalizer_patch"
```

## Scope
- Included:
  - Post-current-pointer goal runtime close.
  - `post-publish-status-<commitToken>.json`.
  - `postPublishStatusPath` evidence pointer in current index.
  - `post_publish_status_write_failed` diagnostic.
- Excluded:
  - Runtime SQLite schema migration.
  - Goal runtime rollback implementation.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P06-1 | Move goal close after publish | Ensure finalizer publishes current pointer before invoking goal runtime close. | Goal close failure cannot roll back artifact publish. |
| P06-2 | Write sidecar | Add `post-publish-status-<commitToken>.json` with goal close status, error, retriable flag, and recordedAt. | Sidecar exists on success/failure when writable. |
| P06-3 | Add diagnostic fallback | On sidecar write failure, emit `post_publish_status_write_failed` to closeout diagnostics. | Current publish remains valid. |

## Exact Execution Targets
| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|----|--------------|--------------|------------|---------|---------------------------|
| P06-1 | none | `.claude/scripts/phase-closeout-finalize.mjs` | finalizer sidecar tests | `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs` | goal failure after publish does not invalidate current. |
| P06-2 | generated runtime sidecar | `.claude/scripts/phase-closeout-finalize.mjs` | finalizer sidecar tests | sidecar fixture test | sidecar contains commit token and status. |

## Critical Product Scenarios
| Scenario | User-visible Expectation | Proof Command | Expected Pass Signal | Evidence Path |
|----------|--------------------------|---------------|----------------------|---------------|
| SCN-11 | Publish can complete even when goal runtime close fails. | sidecar failure simulation | current remains valid and sidecar records failure. | finalizer test output |

## Blockers And Review
- Blocker condition: manifest is mutated after current pointer publish to add goal close result.
- First review checkpoint: after publish/goal close sequence is changed.
- Verification evidence path: finalizer sidecar tests.

## Validation Plan
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs`
- [ ] sidecar write failure simulation

## Deliverables
- Post-publish sidecar behavior.
- Diagnostic fallback for sidecar write failure.

## Phase Completion Checklist
- [ ] Goal close is outside publish transaction.
- [ ] Manifest remains immutable after publish.
- [ ] Sidecar failure is diagnostic-only.
