# Phase 05: Runtime Parity Reference Plan Validation (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-5.1 | User plan / Reference plan validation | Runtime parity verifier must reject broad parent dirs, require `--allow-default-fixture` for default fixture use, and show searched paths/patterns for missing master plan. | Add explicit reference plan validation to JS wrapper and shell core. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-10 | REQ-5.1 | Runtime parity tests cover broad dir rejection, default fixture opt-in, and missing master plan diagnostics. |

## Goal
- Prevent `docs/implementation` or another parent directory from being silently treated as a valid reference plan or default fixture fallback.

## Expected Outcome
- `verify-phase-runtime-parity` accepts only directories with an explicit master plan matching the expected pattern.
- Default reference fixture is used only with `--allow-default-fixture`.
- `Master plan not found` includes searched paths and expected filename patterns.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn:
    - "04-plan-conformance-cli-windows-ux-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/verify-phase-runtime-parity.mjs"
    - ".claude/scripts/verify-phase-runtime-parity-shell-core.sh"
    - ".claude/scripts/lib/runtime-parity-classifier.mjs"
    - ".claude/scripts/lib/runtime-parity-classifier.test.mjs"
    - ".claude/docs/runtime-parity-reference-plan"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-plan.mjs"
    - ".claude/docs/phase-status.yaml"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- In scope:
  - Add `--allow-default-fixture` flag.
  - Validate explicit reference plan directory contains a master plan.
  - Reject broad parent dirs such as `docs/implementation` unless they are a concrete plan package with master file.
  - Add detailed missing-master diagnostic.
- Out of scope:
  - Changing optional_probe|required_runtime behavior from the final outcome baseline.
  - Adding new runtime targets.
  - Replacing shell core with JS-only implementation.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/harness-anomaly-remediation-2026-05-12/00-master-plan-v1.md`
- Required code/data:
  - Runtime parity wrapper already supports `--runtime-profile optional_probe|required_runtime`.
  - Default fixture path is `.claude/docs/runtime-parity-reference-plan`.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P05-1 | Add opt-in default fixture flag | 1) Parse `--allow-default-fixture`. 2) Refuse implicit default fixture when no reference dir is passed. 3) Update usage. | No-arg run fails with guidance unless flag is present. |
| P05-2 | Validate reference dir | 1) Check candidate dir is concrete plan package. 2) Look for expected master plan pattern. 3) Reject broad parent dirs without fallback. | `docs/implementation` input fails with explicit message. |
| P05-3 | Improve missing master diagnostics | 1) Report searched paths. 2) Report expected patterns. 3) Include recommended valid plan dir example. | Test matches path/pattern fields. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-05-1 | Passing `docs/implementation` does not silently fallback to default fixture. | `bash .claude/scripts/verify-phase-runtime-parity.sh docs/implementation --runtime-profile optional_probe` | Exit 1 with broad directory / master plan diagnostic. | `.claude/verification-results-harness-anomaly-phase05.log` |
| SCN-05-2 | Default fixture use is explicit. | `bash .claude/scripts/verify-phase-runtime-parity.sh --allow-default-fixture --runtime-profile optional_probe` | Uses default fixture and reaches optional probe behavior. | `.claude/verification-results-harness-anomaly-phase05.log` |
| SCN-05-3 | Missing master plan error lists searched paths and expected pattern. | `node --test .claude/scripts/lib/runtime-parity-classifier.test.mjs` | Test asserts path/pattern fields. | `.claude/verification-results-harness-anomaly-phase05.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P05-1 | none | `.claude/scripts/verify-phase-runtime-parity.mjs`, `.claude/scripts/verify-phase-runtime-parity-shell-core.sh` | `.claude/scripts/lib/runtime-parity-classifier.test.mjs` | `node --test .claude/scripts/lib/runtime-parity-classifier.test.mjs` | Before: implicit default fixture. After: opt-in required. |
| P05-2 | none | `.claude/scripts/verify-phase-runtime-parity-shell-core.sh` | `.claude/scripts/lib/runtime-parity-classifier.test.mjs` | `bash .claude/scripts/verify-phase-runtime-parity.sh docs/implementation --runtime-profile optional_probe` | Before: possible fallback. After: fails with concrete diagnostic. |
| P05-3 | none | `.claude/scripts/lib/runtime-parity-classifier.mjs` | `.claude/scripts/lib/runtime-parity-classifier.test.mjs` | `node --test .claude/scripts/lib/runtime-parity-classifier.test.mjs` | Before: missing master opaque. After: paths and patterns included. |

## Blockers And Review
- Blocker condition: shell core cannot parse `--allow-default-fixture` without breaking existing positional reference dir parsing.
- First review checkpoint: no-arg behavior change is deliberate and documented in usage.
- Re-review trigger: downstream automation depends on implicit default fixture.
- Verification evidence path: `.claude/verification-results-harness-anomaly-phase05.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/lib/runtime-parity-classifier.test.mjs`
- [ ] Integration: `bash .claude/scripts/verify-phase-runtime-parity.sh <valid-plan-dir> --runtime-profile optional_probe`
- [ ] Integration: `bash .claude/scripts/verify-phase-runtime-parity.sh <valid-plan-dir> --runtime-profile required_runtime`
- [ ] Negative smoke: `bash .claude/scripts/verify-phase-runtime-parity.sh docs/implementation --runtime-profile optional_probe`

## Evidence to Mark Done
- Runtime parity classifier test log.
- Negative broad-directory smoke output.
- Positive explicit fixture or valid plan-dir smoke output.

## Deliverables
- Explicit reference plan validation contract.
- `--allow-default-fixture` opt-in behavior.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- If CI or local scripts call runtime parity without a reference dir, update them in the same phase or record them as blockers.
