# Phase 06: Explicit Phase State Repair Flow (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-6.1 | Repair Flow | Implementation phase may only run `diagnose-repair --dry-run`; apply needs explicit approval or `--apply --repair-run-id`. | Create repair CLI with dry-run default and explicit apply guard. |
| REQ-6.2 | Repair exactness | Apply must match dry-run changes and record before/after, rollback path, target phase. | Use repair plan hash and immutable before/after artifacts. |
| REQ-6.3 | Phase 3/4/5 classification | Phase 3 recovered blocker may become warning; Phase 4/5 without fresh attempt evidence remain blocked. | Encode phase-specific repair policy. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-13 | REQ-6.1 | Repair apply refuses without `--apply --repair-run-id`. |
| AC-14 | REQ-6.2 | Apply writes before/after/rollback and refuses changes not present in dry-run artifact. |
| AC-15 | REQ-6.3 | Phase 3 recovered blocker maps to `success_with_warning`; Phase 4/5 missing evidence maps to `blocked:missing-phase-attempt-evidence`. |

## Goal
- Make state repair explicit, auditable, idempotent, and unable to bypass completion gates.

## Expected Outcome
- A repair dry-run reports proposed state changes without mutation.
- Repair apply requires an explicit repair identity and matches the dry-run plan exactly.
- Second dry-run after apply reports no extra changes.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn:
    - "01-completion-owner-zero-attempt-guard-v1"
    - "02-structured-plan-conformance-artifact-v1"
    - "03-fresh-verdict-identity-recovered-blocker-v1"
    - "04-terminal-pointer-migration-v1"
    - "05-active-run-self-modification-guard-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/phase-state-repair.mjs"
    - ".claude/scripts/phase-state-repair.test.mjs"
    - ".claude/scripts/lib/phase-state-repair.mjs"
    - ".claude/scripts/lib/phase-state-repair.test.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/fixtures/phase-state-repair/"
  readOnlyPaths:
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/workflow-enforcement/current-run.json"
    - ".claude/logs/workflow-enforcement/active-phase-run.json"
    - "docs/implementation/residual-harness-anomaly-v4-2026-05-12/00-master-plan-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: true
  mergePolicy: "sequential_patch"
```

## Scope
- In scope:
  - `diagnose-repair --dry-run` command.
  - `--apply --repair-run-id <id>` command.
  - Dry-run artifact hash and exact apply validation.
  - Before/after/rollback artifact recording.
  - Phase 3/4/5 repair policy fixtures.
  - Idempotency check.
- Out of scope:
  - Applying repair to live state during implementation without user approval.
  - Repairing arbitrary historical plan packages.
  - Treating repair evidence as normal completion evidence.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/residual-harness-anomaly-v4-2026-05-12/00-master-plan-v1.md`
- Required code/data:
  - Phase 03 repair identity guard.
  - Phase 05 self-modification guard.
  - Current phase status and workflow JSON fixtures.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P06-1 | Create dry-run diagnosis | 1) Read phase status and workflow state. 2) Detect false completed, stale verdict, missing attempts. 3) Emit proposed changes without writing state. | Dry-run creates repair plan artifact only. |
| P06-2 | Add explicit apply guard | 1) Require `--apply`. 2) Require `--repair-run-id <id>`. 3) Reject `runLeaseId` as repair identity. | Apply without repair id fails. |
| P06-3 | Enforce dry-run/apply exactness | 1) Hash dry-run proposed changes. 2) Recompute before apply. 3) Refuse drift. | Apply cannot mutate changes not in dry-run plan. |
| P06-4 | Record audit artifacts | 1) Save before snapshot. 2) Save after snapshot. 3) Save rollback path and target phase. | Repair artifact directory is sufficient to undo manually. |
| P06-5 | Encode Phase 3/4/5 policy | 1) Phase 3 recovered blocker evidence maps to warning. 2) Phase 3 without evidence remains blocked. 3) Phase 4/5 without fresh attempt evidence remain blocked. | Phase-specific fixtures pass. |
| P06-6 | Prove idempotency | 1) Apply fixture repair. 2) Run second dry-run. 3) Assert no extra changes. | Second dry-run reports no extra changes. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-06-1 | Repair diagnosis is safe by default. | `node .claude/scripts/phase-state-repair.mjs diagnose-repair --dry-run --status-file .claude/docs/phase-status.yaml --json` | JSON reports proposed changes and no mutation. | `.claude/verification-results-residual-harness-v4-phase06.log` |
| SCN-06-2 | Repair apply cannot run accidentally. | `node --test .claude/scripts/phase-state-repair.test.mjs` | Missing `--apply --repair-run-id` fixture fails. | `.claude/verification-results-residual-harness-v4-phase06.log` |
| SCN-06-3 | Phase 3 recovered blocker becomes warning; Phase 4/5 missing evidence stays blocked. | `node --test .claude/scripts/phase-state-repair.test.mjs .claude/scripts/verify-phase-closeout.test.mjs` | Phase-specific repair policy fixtures pass. | `.claude/verification-results-residual-harness-v4-phase06.log` |
| SCN-06-4 | Repair apply is idempotent. | `node --test .claude/scripts/phase-state-repair.test.mjs` | Second dry-run after apply reports no extra changes. | `.claude/verification-results-residual-harness-v4-phase06.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P06-1 | `.claude/scripts/phase-state-repair.mjs`, `.claude/scripts/lib/phase-state-repair.mjs` | none | `.claude/scripts/phase-state-repair.test.mjs` | `node --test .claude/scripts/phase-state-repair.test.mjs` | Dry-run writes no state mutation. |
| P06-2 | none | `.claude/scripts/phase-state-repair.mjs` | `.claude/scripts/phase-state-repair.test.mjs` | `node --test .claude/scripts/phase-state-repair.test.mjs` | Apply without repair id fails. |
| P06-3 | none | `.claude/scripts/lib/phase-state-repair.mjs` | `.claude/scripts/lib/phase-state-repair.test.mjs` | `node --test .claude/scripts/lib/phase-state-repair.test.mjs` | Drift between dry-run and apply fails. |
| P06-4 | `.claude/scripts/fixtures/phase-state-repair/` | `.claude/scripts/lib/phase-state-repair.mjs` | `.claude/scripts/phase-state-repair.test.mjs` | `node --test .claude/scripts/phase-state-repair.test.mjs` | Before/after/rollback artifacts are recorded. |
| P06-5 | none | `.claude/scripts/lib/phase-state-repair.mjs`, `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/phase-state-repair.test.mjs`, `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/phase-state-repair.test.mjs .claude/scripts/verify-phase-closeout.test.mjs` | Phase 3/4/5 policies pass. |
| P06-6 | none | `.claude/scripts/lib/phase-state-repair.mjs` | `.claude/scripts/phase-state-repair.test.mjs` | `node --test .claude/scripts/phase-state-repair.test.mjs` | Second dry-run reports no changes. |

## Blockers And Review
- Blocker condition: repair plan cannot prove exact dry-run/apply equivalence.
- First review checkpoint: dry-run artifact schema before any apply code.
- Re-review trigger: any path that lets repair apply run with only `runLeaseId` or Harness Change Ledger.
- Verification evidence path: `.claude/verification-results-residual-harness-v4-phase06.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/phase-state-repair.test.mjs`
- [ ] Unit: `node --test .claude/scripts/lib/phase-state-repair.test.mjs`
- [ ] Unit: `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] Integration: `node --test .claude/scripts/*.test.mjs`
- [ ] Integration: `node --test .claude/scripts/lib/*.test.mjs`
- [ ] Self-test: `node .claude/scripts/phase-run-lease.mjs self-test`

## Evidence to Mark Done
- Dry-run no-mutation log.
- Apply guard failure log.
- Before/after/rollback artifact fixture.
- Idempotency fixture log.

## Deliverables
- Explicit phase state repair CLI.
- Repair policy fixtures for Phase 3/4/5.
- Idempotency and rollback evidence contract.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed
- [ ] Manual repair apply approval gate is documented and enforced

## Handoff Notes
- Even after this phase, live repair apply must not be executed unless the user explicitly approves it or invokes the exact apply command with a repair run id.

