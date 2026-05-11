# Phase 05: Runtime Parity Pure Classifier (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.10 | AC-10 | Plan v8 / Runtime parity | Pure classifier first; shell string parsing is only normalization; CLI `--runtime-profile` overrides env fallback. | Add classifier library, fixtures, and parity script wiring. |

## Goal
- Separate runtime parity classification from shell output parsing so package-missing, auth/runtime unavailable, optional probe, and required runtime outcomes are deterministic.

## Expected Outcome
- `@openai/codex-linux-x64` package missing and generic Codex auth/runtime unavailable are separate unit fixtures.
- `--runtime-profile optional_probe` reports skipped warning for unavailable optional runtime.
- `--runtime-profile required_runtime` reports blocker for unavailable required runtime.
- `PHASE_RUNTIME_PROFILE` is a fallback only when CLI flag is absent.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2b"
  dependsOn: []
  conflictsWith: ["04"]
  ownedPaths:
    - ".claude/scripts/lib/runtime-parity-classifier.mjs"
    - ".claude/scripts/lib/runtime-parity-classifier.test.mjs"
    - ".claude/scripts/verify-phase-runtime-parity.mjs"
    - ".claude/scripts/verify-phase-runtime-parity.sh"
    - ".claude/scripts/verify-phase-runtime-parity-shell-core.sh"
  readOnlyPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- In scope:
  - Pure runtime parity classifier.
  - Normalization layer for shell strings.
  - CLI flag `--runtime-profile optional_probe|required_runtime`.
  - Env fallback `PHASE_RUNTIME_PROFILE`.
  - Separate fixtures for package missing and generic runtime unavailable.
- Out of scope:
  - New runtime provider.
  - Auth repair.
  - Phase finalizer result schema.

## Preconditions and Inputs
- Existing parity scripts:
  - `.claude/scripts/verify-phase-runtime-parity.mjs`
  - `.claude/scripts/verify-phase-runtime-parity.sh`
  - `.claude/scripts/verify-phase-runtime-parity-shell-core.sh`
- Existing failure classifier may be used for vocabulary reference, but runtime parity classifier should stay focused and pure.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P05-1 | Add pure classifier | Create `lib/runtime-parity-classifier.mjs` with object input and deterministic output. | Unit fixtures pass without shell process execution. |
| P05-2 | Add shell normalization layer | Convert stderr/stdout/exit code to classifier input outside the classifier. | Shell parsing is not embedded in classification logic. |
| P05-3 | Add profile precedence | Parse `--runtime-profile`; fall back to `PHASE_RUNTIME_PROFILE`; default to required current behavior unless existing script says otherwise. | Tests prove CLI overrides env. |
| P05-4 | Wire parity scripts | Use classifier output to decide warning/skipped vs blocker exit behavior. | Optional missing runtime is warning/skipped; required missing runtime blocks. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-05-1 | Missing Codex native package is identified as package missing, not generic auth failure. | `node --test .claude/scripts/lib/runtime-parity-classifier.test.mjs` | fixture output reason `package_missing`. | terminal test output |
| SCN-05-2 | Generic Codex unavailable/auth failure is a separate classifier result. | `node --test .claude/scripts/lib/runtime-parity-classifier.test.mjs` | fixture output reason `runtime_unavailable` or `auth_unavailable`. | terminal test output |
| SCN-05-3 | Optional profile skips unavailable runtime; required profile blocks. | `node --test .claude/scripts/lib/runtime-parity-classifier.test.mjs` | optional result warning/skipped, required result blocker. | terminal test output |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P05-1 | `.claude/scripts/lib/runtime-parity-classifier.mjs`, `.claude/scripts/lib/runtime-parity-classifier.test.mjs` | none | `.claude/scripts/lib/runtime-parity-classifier.test.mjs` | `node --test .claude/scripts/lib/runtime-parity-classifier.test.mjs` | Pure classifier fixtures pass. |
| P05-4 | none | `.claude/scripts/verify-phase-runtime-parity.mjs`, `.claude/scripts/verify-phase-runtime-parity.sh`, `.claude/scripts/verify-phase-runtime-parity-shell-core.sh` | parity tests or direct smoke | `bash .claude/scripts/verify-phase-runtime-parity.sh docs/implementation --runtime-profile optional_probe` | Optional unavailable runtime is skipped/warning, not blocker. |

## Blockers And Review
- Blocker condition: classifier reads process env, files, or raw shell strings directly.
- First review checkpoint: classifier input/output schema is small and fixture-friendly.
- Re-review trigger: CLI/env precedence changes existing required runtime behavior unexpectedly.
- Verification evidence path: classifier unit test output and parity smoke output.

## Validation Plan
- [ ] `node --test .claude/scripts/lib/runtime-parity-classifier.test.mjs`
- [ ] `bash .claude/scripts/verify-phase-runtime-parity.sh docs/implementation --runtime-profile optional_probe`
- [ ] `bash .claude/scripts/verify-phase-runtime-parity.sh docs/implementation --runtime-profile required_runtime`
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Passing pure classifier fixtures.
- Optional and required profile smoke outputs.
- CLI flag precedence over `PHASE_RUNTIME_PROFILE` test.

## Deliverables
- Runtime parity classifier library.
- Runtime parity profile parsing and wiring.
- Package-missing vs generic unavailable fixtures.

## Phase Completion Checklist
- [ ] Pure classifier has no shell parsing side effects.
- [ ] Package missing fixture is separate from generic runtime unavailable fixture.
- [ ] `--runtime-profile` is primary and env is fallback.
- [ ] Optional profile emits warning/skipped.
- [ ] Required profile emits blocker.

## Handoff Notes
- Run the full verification sweep after this phase and Phase 04 are both complete.
