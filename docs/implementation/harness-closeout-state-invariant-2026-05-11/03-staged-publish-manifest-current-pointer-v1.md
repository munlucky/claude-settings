# Phase 03: Staged Publish Manifest And Current Pointer (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.5 | AC-05 | Plan v10 / Staged Publish | Publish order is canonical artifacts, immutable manifest, current pointer last. | Rewrite finalizer publish path. |
| REQ-1.6 | AC-06 | Plan v10 / Hash Contract | Hashes are raw bytes SHA-256 and mtime is debug only. | Manifest metadata and current index hash contract. |

## Goal
- Prevent partial current exposure by publishing current pointer only after canonical artifacts and immutable manifest are complete.

## Expected Outcome
- A failed publish can leave partial canonical disk state, but readers still see the old current pointer.
- `manifestHash` validates the immutable manifest using raw bytes SHA-256.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn: ["01", "02"]
  conflictsWith: ["04", "06", "07"]
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/lib/current-artifacts-state.mjs"
    - ".claude/scripts/lib/current-artifacts-state.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/closeout-diagnostics.mjs"
    - ".claude/tests/fixtures/phase-closeout/phase-08-success/**"
  sharedMutablePaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_publish_path"
```

## Scope
- Included:
  - `closeout-prep/<commitToken>/` staging.
  - Immutable `closeout-sync-manifest.json`.
  - `current-artifacts.json` last publish.
  - Manifest-owned artifact metadata.
- Excluded:
  - Supersede archive snapshot implementation.
  - Goal runtime sidecar.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Add staging model | Generate candidates under `.claude/logs/workflow-enforcement/closeout-prep/<commitToken>/`. | No canonical file is touched during prepare. |
| P03-2 | Build manifest metadata | Record `hashAlgorithm: sha256_raw_bytes`, `commitToken`, `verifiedGitTreeFingerprint`, and `artifacts[kind]`. | Manifest metadata can validate active artifacts without parsing file bodies. |
| P03-3 | Implement publish order | Replace canonical artifacts, then manifest, then current index. | Current pointer is written last in all success paths. |
| P03-4 | Add failure fixtures | Simulate failure after canonical publish and after manifest publish. | Old current index remains valid. |

## Exact Execution Targets
| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|----|--------------|--------------|------------|---------|---------------------------|
| P03-1 | none | `.claude/scripts/phase-closeout-finalize.mjs` | finalizer publish tests | `node --test .claude/scripts/*.test.mjs` | prepare does not mutate canonical paths. |
| P03-2 | none | `.claude/scripts/phase-closeout-finalize.mjs`, `.claude/scripts/lib/current-artifacts-state.mjs` | helper tests | `node --test .claude/scripts/lib/current-artifacts-state.test.mjs` | raw bytes manifest hash checks pass. |
| P03-3 | none | `.claude/scripts/phase-closeout-finalize.mjs` | finalizer publish tests | fixture-backed dry-run and publish simulation | current pointer last tests pass. |

## Critical Product Scenarios
| Scenario | User-visible Expectation | Proof Command | Expected Pass Signal | Evidence Path |
|----------|--------------------------|---------------|----------------------|---------------|
| SCN-05 | Partial canonical publish does not become current. | publish failure simulation test | old current remains selected. | finalizer test output |
| SCN-06 | Manifest hash detects raw byte drift. | helper test | `manifest_hash_mismatch` case passes. | helper test output |

## Blockers And Review
- Blocker condition: any path writes `current-artifacts.json` before manifest publish succeeds.
- First review checkpoint: after staging model is implemented but before current pointer publish code lands.
- Verification evidence path: finalizer publish tests and dry-run JSON.

## Validation Plan
- [ ] `node --test .claude/scripts/lib/current-artifacts-state.test.mjs`
- [ ] `node --test .claude/scripts/*.test.mjs`
- [ ] fixture-backed dry-run command

## Deliverables
- Tokenized staging finalizer.
- Immutable manifest generation.
- Current pointer last publish path.

## Phase Completion Checklist
- [ ] Current pointer is always written last.
- [ ] Manifest hash is raw bytes SHA-256.
- [ ] Partial canonical state is ignored unless current index points to it.
