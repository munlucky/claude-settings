# Phase 05: PID Liveness Contract (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-5.1 | ENG Review / PID liveness | Windows, WSL, and node-parent PID namespaces must be explicit. | Define `pidNamespace` values and compatibility checks. |
| REQ-5.2 | User plan / Dispatcher timeout/liveness | Liveness false positives must distinguish stale child from namespace mismatch. | Define degraded evidence and fake checker test strategy. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-05 | REQ-5.1, REQ-5.2 | Namespace compatibility matrix states mismatch becomes `pid_namespace_mismatch` degraded evidence, not `stale_child_no_progress`. |

## Goal
- Make dispatcher liveness checks reliable in mixed Windows/WSL/node-parent execution environments.

## Expected Outcome
- PID evidence records the namespace it belongs to, and stale child detection runs only when checker namespace and PID namespace are compatible.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-3"
  dependsOn:
    - "01-lifecycle-projection-writer-contract-v1"
    - "03-dispatch-lifecycle-contract-v1"
  conflictsWith:
    - "03-dispatch-lifecycle-contract-v1"
  ownedPaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/lib/phase-liveness-checker.mjs"
    - ".claude/scripts/lib/phase-liveness-checker.test.mjs"
    - ".claude/scripts/fixtures/pid-liveness/"
  readOnlyPaths:
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
    - ".claude/logs/workflow-enforcement/latest-dispatch.json"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- Define `pidNamespace` contract.
- Define liveness checker injection strategy.
- Define namespace compatibility matrix.
- Define degraded evidence payload for namespace mismatch.
- Define stale/no-progress classification prerequisites.

## Out of Scope
- Implementing a real process checker in this document-writing turn.
- Replacing OS process APIs globally.
- Treating namespace mismatch as child process failure.
- Changing dispatch status vocabulary.

## PID Namespace Contract
| Value | Meaning | Typical Checker |
|-------|---------|-----------------|
| `windows` | PID is from Windows process namespace. | PowerShell/Node process probe on Windows host. |
| `wsl` | PID is from WSL process namespace. | WSL-side `kill -0`, `/proc`, or equivalent checker. |
| `node-parent` | PID belongs to current Node parent process context and may not map cleanly across host/guest boundary. | Injected Node checker with parent process ownership context. |

## Namespace Compatibility Matrix
| PID Namespace | Checker Namespace | Result | Reason Code |
|---------------|-------------------|--------|-------------|
| `windows` | `windows` | liveness check allowed | none |
| `wsl` | `wsl` | liveness check allowed | none |
| `node-parent` | `node-parent` | liveness check allowed | none |
| `windows` | `wsl` | degraded evidence, no stale-child classification | `pid_namespace_mismatch` |
| `wsl` | `windows` | degraded evidence, no stale-child classification | `pid_namespace_mismatch` |
| `node-parent` | `windows` or `wsl` without parent ownership proof | degraded evidence, no stale-child classification | `pid_namespace_mismatch` |
| missing | any | degraded evidence, no stale-child classification | `pid_namespace_missing` |

## Stale Child Classification Prerequisites
- PID namespace is present.
- Checker namespace is compatible with PID namespace.
- Child PID exists in lifecycle payload.
- Last heartbeat and last log timestamps exceed configured no-progress threshold.
- Checker reports process alive for `stale_child_no_progress`, process absent for `child_exited_without_closeout`, and process alive after tool timeout for `child_still_running`.

## Acceptance Criteria
- AC-05: lifecycle payload requires `pidNamespace` whenever PID or liveness evidence is recorded.
- AC-05: namespace mismatch produces `pid_namespace_mismatch` degraded evidence.
- AC-05: namespace mismatch must not be promoted to `stale_child_no_progress`.
- AC-05: unit tests use an injected fake liveness checker instead of relying on host OS process state.

## Verification Evidence
| Evidence | Command | Expected Signal | Evidence Path |
|----------|---------|-----------------|---------------|
| Namespace matrix present | `Select-String -Path docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/05-pid-liveness-contract-v1.md -Pattern "pid_namespace_mismatch","Namespace Compatibility Matrix"` | Matrix and degraded reason exist. | `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/QA_REPORT.md` |
| Future liveness tests | `node --test .claude/scripts/lib/phase-liveness-checker.test.mjs .claude/scripts/moonshot-phase-dispatch.test.mjs` | Fake checker covers compatible, mismatch, missing namespace, alive, and exited cases. | `.claude/verification-results-lifecycle-projection-phase05.log` |

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P05-1 | Add liveness checker abstraction | 1) Create injectable checker. 2) Support namespace-aware results. | Unit tests do not call real OS process state. |
| P05-2 | Add lifecycle payload namespace | 1) Add `pidNamespace` to dispatch lifecycle payloads. 2) Validate required namespace when PID exists. | Missing namespace yields degraded evidence. |
| P05-3 | Update stale classification | 1) Gate stale/no-progress on namespace compatibility. 2) Emit timeout reason codes only after compatible check. | Namespace mismatch never returns stale child. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-05-1 | A Windows dispatcher observing a WSL PID does not falsely report stale child. | `node --test .claude/scripts/lib/phase-liveness-checker.test.mjs` | `pid_namespace_mismatch` degraded evidence and no `stale_child_no_progress`. | `.claude/verification-results-lifecycle-projection-phase05.log` |
| SCN-05-2 | A compatible namespace can still classify real no-progress, exited, and still-running cases. | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | distinct `stale_child_no_progress`, `child_exited_without_closeout`, `child_still_running` fixture results. | `.claude/verification-results-lifecycle-projection-phase05.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P05-1 | `.claude/scripts/lib/phase-liveness-checker.mjs`, `.claude/scripts/lib/phase-liveness-checker.test.mjs` | none | `.claude/scripts/lib/phase-liveness-checker.test.mjs` | `node --test .claude/scripts/lib/phase-liveness-checker.test.mjs` | Fake checker covers namespace compatibility. |
| P05-2 | `.claude/scripts/fixtures/pid-liveness/*.json` | `.claude/scripts/moonshot-phase-dispatch.mjs` | `.claude/scripts/moonshot-phase-dispatch.test.mjs` | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | Dispatch payloads include namespace and liveness timestamps. |

## Blockers And Review
- Blocker condition: code cannot determine the namespace for emitted child PID and no safe degraded evidence path exists.
- First review checkpoint: namespace values and fake checker interface before dispatcher integration.
- Re-review trigger: any use of `process.kill(pid, 0)` without namespace guard for cross-boundary PID evidence.
- Verification evidence path: `.claude/verification-results-lifecycle-projection-phase05.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/lib/phase-liveness-checker.test.mjs`
- [ ] Unit: `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs`
- [ ] Integration: `node --test .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Fake checker test output.
- Dispatch fixture output with namespace mismatch degraded evidence.
- Regression logs showing distinct timeout/liveness reason codes.

## Deliverables
- Namespace-aware liveness checker implementation in a later run.
- Dispatch liveness fixtures that protect Windows/WSL mixed environments from false stale-child blockers.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria.
- [ ] Acceptance criteria AC-05 passes.
- [ ] Validation checks pass.
- [ ] Deliverables are present and reviewed.

## Handoff Notes
- Phase 03 owns status compatibility; this phase may add liveness fields but must not add new `latest-dispatch.status` values.

