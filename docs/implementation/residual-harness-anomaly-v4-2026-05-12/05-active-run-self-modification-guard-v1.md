# Phase 05: Active Run Self Modification Guard (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-5.1 | Self-Modification Guard | Active harness run blocks `.claude/scripts/**` edits unless `HARNESS_MAINTENANCE_MODE=1` or valid `repairRunId` exists. | Add active-run guard and tests. |
| REQ-5.2 | Ledger is not permission | Harness Change Ledger is evidence only, not permission. | Ensure ledger-only exception fails. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-11 | REQ-5.1 | Guard rejects `.claude/scripts/**` modifications during active run without maintenance or repair identity. |
| AC-12 | REQ-5.2 | Guard rejects ledger-only exception. |

## Goal
- Prevent active harness runs from modifying their own execution scripts except through explicit maintenance or repair flows.

## Expected Outcome
- Active-run detection uses `current-run.json`, `active-phase-run.json`, and `phase-status.activeRunLeaseId`.
- Script changes during active runs require `HARNESS_MAINTENANCE_MODE=1` or a valid `repairRunId`.
- Harness Change Ledger remains closeout evidence, not permission.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "01-completion-owner-zero-attempt-guard-v1"
    - "04-terminal-pointer-migration-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/self-modification-guard.mjs"
    - ".claude/scripts/lib/self-modification-guard.test.mjs"
    - ".claude/scripts/phase-capability-preflight.mjs"
    - ".claude/scripts/phase-capability-preflight.test.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.test.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
  readOnlyPaths:
    - ".claude/logs/workflow-enforcement/current-run.json"
    - ".claude/logs/workflow-enforcement/active-phase-run.json"
    - ".claude/docs/phase-status.yaml"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Scope
- In scope:
  - Active-run detector.
  - Guard for `.claude/scripts/**` modifications.
  - Maintenance mode exception.
  - Valid repair identity exception.
  - Ledger-only rejection fixture.
- Out of scope:
  - Blocking documentation-only edits.
  - Blocking repair dry-run diagnostics.
  - Replacing Git hooks or OS ACLs.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/residual-harness-anomaly-v4-2026-05-12/00-master-plan-v1.md`
- Required code/data:
  - Phase 03 repair identity contract.
  - Phase 04 active/terminal pointer contract.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P05-1 | Add active-run detector | 1) Read current-run. 2) Read active-phase-run. 3) Read phase-status active lease. 4) Treat stale/terminal states as inactive only with explicit terminal evidence. | Detector fixtures cover active, inactive, stale, terminal. |
| P05-2 | Add script modification guard | 1) Identify `.claude/scripts/**` changed paths. 2) Reject when active run exists. 3) Permit only maintenance mode or valid repair id. | Guard rejects active script edits by default. |
| P05-3 | Wire guard into preflight/dispatch | 1) Run guard before implementation dispatch or closeout verification where changed paths are known. 2) Provide actionable stop reason. | Active script edit fails before mutation proceeds. |
| P05-4 | Reject ledger-only permission | 1) Add fixture with Harness Change Ledger but no maintenance/repair identity. 2) Assert rejection. | Ledger-only exception fails. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-05-1 | Active harness run cannot rewrite its own scripts without explicit mode. | `node --test .claude/scripts/lib/self-modification-guard.test.mjs` | Active `.claude/scripts/**` change rejects. | `.claude/verification-results-residual-harness-v4-phase05.log` |
| SCN-05-2 | Harness Change Ledger does not grant permission. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Ledger-only fixture rejects active-run script modification. | `.claude/verification-results-residual-harness-v4-phase05.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P05-1 | `.claude/scripts/lib/self-modification-guard.mjs` | none | `.claude/scripts/lib/self-modification-guard.test.mjs` | `node --test .claude/scripts/lib/self-modification-guard.test.mjs` | Active-run detector fixtures pass. |
| P05-2 | none | `.claude/scripts/lib/self-modification-guard.mjs` | `.claude/scripts/lib/self-modification-guard.test.mjs` | `node --test .claude/scripts/lib/self-modification-guard.test.mjs` | Default active script edit rejected. |
| P05-3 | none | `.claude/scripts/phase-capability-preflight.mjs`, `.claude/scripts/moonshot-phase-dispatch.mjs` | `.claude/scripts/phase-capability-preflight.test.mjs`, `.claude/scripts/moonshot-phase-dispatch.test.mjs` | `node --test .claude/scripts/phase-capability-preflight.test.mjs .claude/scripts/moonshot-phase-dispatch.test.mjs` | Guard stop reason is actionable. |
| P05-4 | none | `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Ledger-only exception fails. |

## Blockers And Review
- Blocker condition: changed-path inventory is unavailable before mutation.
- First review checkpoint: active-run detector fixtures before dispatch/preflight wiring.
- Re-review trigger: accepting Harness Change Ledger as permission.
- Verification evidence path: `.claude/verification-results-residual-harness-v4-phase05.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/lib/self-modification-guard.test.mjs`
- [ ] Unit: `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] Integration: `node --test .claude/scripts/*.test.mjs`
- [ ] Integration: `node --test .claude/scripts/lib/*.test.mjs`

## Evidence to Mark Done
- Active-run guard fixture logs.
- Ledger-only rejection log.
- Stop reason text in failing fixture.

## Deliverables
- Self-modification guard module.
- Preflight/dispatch/closeout integration points.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 06 repair apply must pass this guard only with a valid `repairRunId`.

