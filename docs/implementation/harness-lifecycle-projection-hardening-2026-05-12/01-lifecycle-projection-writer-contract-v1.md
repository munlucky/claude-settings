# Phase 01: Lifecycle Projection Writer Contract (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.1 | User plan / Lifecycle Projection Writer 계약 | `lib/lifecycle-projection-writer.mjs` is the primary writer. | Define ownership and `recordLifecycleTransition(event)` as the only projection write API. |
| REQ-1.2 | User plan / Event schema | Event schema includes source, target state files, phase identity, status fields, PID namespace, and patch payload. | Lock the field contract and validation expectations. |
| REQ-1.3 | ENG Review / Writer ownership | Existing direct writers must converge instead of adding a fourth writer. | Document caller conversion order and event type mapping. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-01 | REQ-1.1, REQ-1.2, REQ-1.3 | Schema table and caller/event mapping table explicitly cover `phase-run-lease-store`, `moonshot-phase-dispatch`, `phase-closeout-finalize`, and reconciler/local fallback. |

## Goal
- Define one lifecycle projection writer contract that future implementation phases can use to remove competing direct writes.

## Expected Outcome
- Future implementers can create `lib/lifecycle-projection-writer.mjs` and convert existing writers without guessing event names, target files, or ownership boundaries.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith:
    - "02-pointer-invariant-contract-v1"
    - "03-dispatch-lifecycle-contract-v1"
    - "04-closeout-recovery-taxonomy-v1"
    - "05-pid-liveness-contract-v1"
  ownedPaths:
    - ".claude/scripts/lib/lifecycle-projection-writer.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.test.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
  readOnlyPaths:
    - ".claude/scripts/harness-state-invariants.mjs"
    - ".claude/scripts/lib/final-outcome-projection.mjs"
    - "docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/00-master-plan-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_primary_contract"
```

## Scope
- Define `recordLifecycleTransition(event)` module ownership.
- Define event schema and validation behavior.
- Define `primaryTargetStateFile` vs `targetStateFiles[]`.
- Define direct writer conversion order and event type table.
- Define idempotent write, atomic write, and debug cursor expectations at the contract level.

## Out of Scope
- Creating or editing `.mjs` files in this document-writing turn.
- Removing existing direct write calls before the primary writer exists.
- Changing final-outcome canonical verdict vocabulary.
- Changing runtime preparation or phase-runner dispatch behavior.

## Lifecycle Event Schema
| Field | Required | Meaning | Notes |
|-------|----------|---------|-------|
| `source` | yes | Caller module or subsystem name. | Example: `phase-run-lease-store`, `moonshot-phase-dispatch`, `phase-closeout-finalize`. |
| `targetStateFiles[]` | yes | All projection files this transition may update. | Must include every workflow/lease/projection target touched by the writer. |
| `primaryTargetStateFile` | yes | Event origin or representative projection file. | It is not the complete write set; the complete write set is `targetStateFiles[]`. |
| `phaseNumber` | yes | Phase number associated with the transition. | Numeric or numeric string accepted by caller, normalized by writer. |
| `phaseTitle` | yes | Human-readable phase title. | Empty title is invalid for prepared/running/terminal phase events. |
| `status` | yes | Existing projection status value. | Must use the target file's compatible vocabulary. |
| `completionStatus` | conditional | Terminal or closeout completion status. | Required for terminal lifecycle events. |
| `lifecycleEvent` | yes | Fine-grained transition name. | New lifecycle events must not be written into `latest-dispatch.status`. |
| `timestamp` | yes | ISO-8601 transition time. | Writer supplies timestamp if caller omits it only in tests or internal convenience APIs. |
| `pidNamespace` | conditional | `windows`, `wsl`, or `node-parent`. | Required when PID or liveness evidence is present. |
| `payloadPatch` | yes | Structured patch applied to target projections. | Must not be free-form Markdown. |

## Caller Event Mapping
| Caller | Existing Direct Write Surface | Required Lifecycle Events | Primary Target | Target State Files |
|--------|-------------------------------|---------------------------|----------------|--------------------|
| `phase-run-lease-store` | `current-run-*.json`, `current-run.json`, `active-phase-run-*.json` | `lease_started`, `lease_heartbeat`, `lease_completed`, `lease_failed` | `active-phase-run.json` | `active-phase-run*.json`, `current-run*.json` |
| `moonshot-phase-dispatch` | `.claude/logs/workflow-enforcement/latest-dispatch.json` | `dispatch_prepared`, `dispatch_started`, `dispatch_heartbeat`, `dispatch_completed`, `dispatch_failed`, `dispatch_superseded` | `latest-dispatch.json` | `latest-dispatch.json` |
| `phase-closeout-finalize` | `current-run.json`, `active-phase-run.json`, `latest-dispatch.json`, phase status projection | `closeout_started`, `closeout_completed`, `closeout_blocked`, `closeout_recovered` | `current-run.json` | phase status, `current-run.json`, `active-phase-run.json`, `latest-dispatch.json` |
| reconciler/local fallback | workflow state reconciliation outputs | `fallback_completed`, `fallback_superseded_dispatch`, `blocker_recovered` | reconciled workflow file | reconciled workflow files and phase status when applicable |

## Direct Writer Convergence Order
| Order | Caller | Required First Step | Done Signal |
|-------|--------|---------------------|-------------|
| 1 | `phase-run-lease-store` | Route lease start/heartbeat writes through `recordLifecycleTransition(event)`. | Existing lease tests pass and current-run/active-run JSON remains byte-compatible except allowed lifecycle metadata. |
| 2 | `moonshot-phase-dispatch` | Route latest-dispatch prepared/terminal writes through writer without changing `status` enum. | Dispatcher tests still see expected `prepared/completed/failed/superseded` values. |
| 3 | `phase-closeout-finalize` | Route terminal workflow projection through writer after finalizer payload is normalized. | Closeout tests pass and terminal state uses Phase 04 taxonomy. |
| 4 | reconciler/local fallback | Route fallback/superseded writes through writer once dispatch and closeout hooks are stable. | Fallback recovery tests preserve historical warning and superseded dispatch evidence. |

## Acceptance Criteria
- AC-01: `recordLifecycleTransition(event)` has one primary writer owner and all existing direct writer callers are listed with event types.
- AC-01: `primaryTargetStateFile` is documented as event origin/representative target, while `targetStateFiles[]` is the complete mutation set.
- AC-01: The phase plan names the conversion order and stop condition for each caller.
- AC-01: No plan text requires `.mjs` implementation changes during this document-writing turn.

## Verification Evidence
| Evidence | Command | Expected Signal | Evidence Path |
|----------|---------|-----------------|---------------|
| Schema completeness | `Select-String -Path docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/01-lifecycle-projection-writer-contract-v1.md -Pattern "Lifecycle Event Schema","Caller Event Mapping"` | Both sections exist. | `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/QA_REPORT.md` |
| Caller coverage | `Select-String -Path docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/01-lifecycle-projection-writer-contract-v1.md -Pattern "phase-run-lease-store","moonshot-phase-dispatch","phase-closeout-finalize","reconciler"` | All four caller categories are present. | `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/QA_REPORT.md` |

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Implement writer module in a later phase-runner run | 1) Add `lifecycle-projection-writer.mjs`. 2) Validate event schema. 3) Apply target file writes atomically. | Writer unit tests cover required and invalid fields. |
| P01-2 | Convert lease writer | 1) Replace lease direct writes with lifecycle events. 2) Preserve current JSON shape. | Lease tests and existing workflow readers pass. |
| P01-3 | Convert dispatch/finalizer/reconciler callers | 1) Convert dispatch writes. 2) Convert closeout terminal projection. 3) Convert fallback reconciliation. | Existing dispatcher/finalizer tests pass with lifecycle metadata. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | Future implementation has one lifecycle writer contract, not four competing writers. | `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs` | All caller event fixtures pass. | `.claude/verification-results-lifecycle-projection-phase01.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P01-1 | `.claude/scripts/lib/lifecycle-projection-writer.mjs`, `.claude/scripts/lib/lifecycle-projection-writer.test.mjs` | none | `.claude/scripts/lib/lifecycle-projection-writer.test.mjs` | `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs` | Invalid events fail; valid events produce expected target patches. |
| P01-2 | none | `.claude/scripts/lib/phase-run-lease-store.mjs` | existing lease and workflow tests | `node --test .claude/scripts/lib/*.test.mjs` | Lease projections remain compatible. |
| P01-3 | none | `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/phase-closeout-finalize.mjs` | dispatcher/finalizer tests | `node --test .claude/scripts/*.test.mjs` | No regression in dispatch or closeout lifecycle. |

## Blockers And Review
- Blocker condition: any caller requires status vocabulary changes before Phase 03 approves them.
- First review checkpoint: writer event schema and caller mapping before touching caller code.
- Re-review trigger: any proposal to expand canonical final-outcome run verdicts.
- Verification evidence path: `.claude/verification-results-lifecycle-projection-phase01.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs`
- [ ] Regression: `node --test .claude/scripts/*.test.mjs`
- [ ] Regression: `node --test .claude/scripts/lib/*.test.mjs`

## Evidence to Mark Done
- Writer schema tests.
- Caller conversion diff limited to owned paths.
- Regression logs showing existing dispatch/finalizer readers still pass.

## Deliverables
- Primary writer module contract implemented in a later run.
- Caller event mapping preserved in tests.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria.
- [ ] Acceptance criteria AC-01 passes.
- [ ] Validation checks pass.
- [ ] Deliverables are present and reviewed.

## Handoff Notes
- Phase 02/03/04/05 must consume the event schema from this phase instead of inventing per-file lifecycle shapes.

