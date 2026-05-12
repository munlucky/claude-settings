# Phase 04: Plan Conformance CLI And Windows UX Contract (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-4.1 | User plan / CLI contract | `verify-plan-conformance.mjs` needs `--help`, unknown option usage, and recommended alternatives for unsupported plan-level options. | Add usage renderer and parse errors with valid invocation guidance. |
| REQ-4.2 | User plan / Windows UX | POSIX env prefix in PowerShell should be classified as `windows_shell_env_syntax` and show `$env:KEY='value'; command`. | Add shell syntax classifier and test fixture. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-08 | REQ-4.1 | CLI tests cover `--help`, unknown option, and unsupported `--status-file`/`--plan-dir`/`--master-plan`. |
| AC-09 | REQ-4.2 | PowerShell POSIX env prefix negative smoke returns `windows_shell_env_syntax` with `$env:` example. |

## Goal
- Stop CLI contract drift from turning simple operator mistakes into opaque blocker states.

## Expected Outcome
- `verify-plan-conformance.mjs --help` exits 0 with artifact-level usage.
- Unknown options print valid usage.
- Plan-level options are rejected with recommended artifact-level command or correct verifier script.
- PowerShell POSIX env prefix mistakes receive a Windows-specific diagnostic.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith:
    - "05-runtime-parity-reference-validation-v1"
  ownedPaths:
    - ".claude/scripts/verify-plan-conformance.mjs"
    - ".claude/scripts/verify-plan-conformance.test.mjs"
    - ".claude/scripts/verify-shell-syntax.mjs"
    - ".claude/scripts/verify-shell-syntax.test.mjs"
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/lib/failure-classifier.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-runtime-parity.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- In scope:
  - Add `--help` and `-h` support for `verify-plan-conformance.mjs`.
  - Return usage with unknown option errors.
  - Detect unsupported plan-level options and print recommended alternatives.
  - Classify PowerShell POSIX env prefix as `windows_shell_env_syntax`.
- Out of scope:
  - Making `verify-plan-conformance.mjs` support plan-level verification.
  - Changing `verify-phase-closeout.mjs` CLI semantics.
  - Rewriting shell syntax verifier beyond the Windows env prefix case.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/harness-anomaly-remediation-2026-05-12/00-master-plan-v1.md`
- Required code/data:
  - `verify-plan-conformance.mjs` currently accepts artifact-level paths only.
  - `verify-shell-syntax.mjs` already has test coverage and can host the Windows syntax diagnostic if cleaner than the conformance verifier.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Add CLI help | 1) Add usage function. 2) Support `--help`/`-h`. 3) Exit 0 without requiring artifact paths. | Help output lists required artifact-level options. |
| P04-2 | Improve option errors | 1) Unknown option throws with usage. 2) `--status-file`, `--plan-dir`, `--master-plan` emit recommended alternatives. | Tests assert message includes valid command. |
| P04-3 | Add Windows env syntax diagnostic | 1) Detect `FOO=bar command` in PowerShell context. 2) Return `windows_shell_env_syntax`. 3) Print `$env:FOO='bar'; command` example. | Negative/positive smoke tests pass. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | Operator can discover correct conformance verifier usage without reading source. | `node .claude/scripts/verify-plan-conformance.mjs --help` | Exit 0 and usage includes `--phase-doc`, `--sprint-contract`, `--qa-report`, `--scorecard`, `--handoff`. | `.claude/verification-results-harness-anomaly-phase04.log` |
| SCN-04-2 | Unsupported plan-level options suggest the correct command instead of generic unsupported text. | `node --test .claude/scripts/verify-plan-conformance.test.mjs` | Test matches recommended alternative command. | `.claude/verification-results-harness-anomaly-phase04.log` |
| SCN-04-3 | PowerShell POSIX env prefix error is actionable. | `node --test .claude/scripts/verify-shell-syntax.test.mjs` | Diagnostic code is `windows_shell_env_syntax` and message includes `$env:` example. | `.claude/verification-results-harness-anomaly-phase04.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P04-1 | `.claude/scripts/verify-plan-conformance.test.mjs` if missing | `.claude/scripts/verify-plan-conformance.mjs` | `.claude/scripts/verify-plan-conformance.test.mjs` | `node .claude/scripts/verify-plan-conformance.mjs --help` | Before: unknown option or required args. After: usage exit 0. |
| P04-2 | none | `.claude/scripts/verify-plan-conformance.mjs` | `.claude/scripts/verify-plan-conformance.test.mjs` | `node --test .claude/scripts/verify-plan-conformance.test.mjs` | Before: generic unknown option. After: usage and alternatives. |
| P04-3 | none | `.claude/scripts/verify-shell-syntax.mjs`, `.claude/scripts/lib/failure-classifier.mjs` | `.claude/scripts/verify-shell-syntax.test.mjs`, `.claude/scripts/lib/failure-classifier.test.mjs` | `node --test .claude/scripts/verify-shell-syntax.test.mjs .claude/scripts/lib/failure-classifier.test.mjs` | Before: PowerShell env syntax not classified. After: diagnostic and positive `$env:` smoke. |

## Blockers And Review
- Blocker condition: tests require spawning a real PowerShell unavailable in the current environment.
- First review checkpoint: CLI usage text is artifact-level and does not imply unsupported plan-level support.
- Re-review trigger: adding new supported options to `verify-plan-conformance.mjs`.
- Verification evidence path: `.claude/verification-results-harness-anomaly-phase04.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/verify-plan-conformance.test.mjs`
- [ ] Unit: `node --test .claude/scripts/verify-shell-syntax.test.mjs`
- [ ] Unit: `node --test .claude/scripts/lib/failure-classifier.test.mjs`
- [ ] Integration: `node .claude/scripts/verify-shell-syntax.mjs`

## Evidence to Mark Done
- CLI help output.
- Unknown/unsupported option test output.
- Windows env syntax negative/positive smoke output.

## Deliverables
- Help/usage contract for `verify-plan-conformance.mjs`.
- Windows shell env syntax diagnostic and tests.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 05 should reuse this phase's usage style for runtime parity reference-plan errors.
