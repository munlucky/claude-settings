# Phase 06: Regression Fixture and Documentation Sync (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MWR-017 | WASTE_REGISTER | 2026-05-06 failure pattern becomes regression fixture | Add fixture and boundary tests |
| MWR-018 | WASTE_REGISTER | Related reliability docs indexed to avoid overlap | Update documentation index and references |

## Goal

- Lock the waste-reduction behavior with regression coverage and documentation that prevents future overlapping plans.

## Expected Outcome

- A fixture representing the 2026-05-06 waste pattern fails before the fixes and passes after Phases 01-05.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn: ["01", "02", "03", "04", "05"]
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/verify-phase-runner-boundary.sh"
    - ".claude/scripts/verify-phase-runtime-parity.sh"
    - ".claude/docs/reference/codex-phase-runner-workflow.md"
    - ".claude/docs/reference/codex-phase-runner-workflow.html"
    - ".claude/verification.contract.yaml"
  readOnlyPaths:
    - "docs/implementation/harness-reliability-retro-2026-05-05/**"
    - "docs/implementation/harness-native-awtl-rsme-2026-05-06/**"
    - "docs/implementation/moonshot-harness-waste-reduction-2026-05-06/**"
  sharedMutablePaths:
    - ".claude/verification.contract.yaml"
  requiresManualEvidence: false
  mergePolicy: "sequential_closeout"
```

## Scope

- In scope:
  - Add boundary/runtime parity fixture for path failure, stale verdict, coordinator restart, closeout sync, and log hygiene.
  - Update reference docs to link this plan as a follow-up to completed prior work.
  - Run knowledge repository audit after structural documentation changes.
- Out of scope:
  - Reopening completed prior phase checklists.

## Preconditions and Inputs

- Phases 01-05 complete.
- Existing docs:
  - `.claude/docs/reference/codex-phase-runner-workflow.md`
  - `.claude/docs/reference/codex-phase-runner-workflow.html`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P06-1 | Add waste-pattern fixture | Encode 2026-05-06 pattern in boundary/runtime parity tests | Fixture proves no worker retry for path/stale/control-plane failures |
| P06-2 | Verify full workflow | Run required workflow/core checks | All configured checks pass |
| P06-3 | Update reference docs | Add waste-reduction behavior and related-plan index | Docs explain non-overlap and new artifacts |
| P06-4 | Close source map | Confirm every MWR item has phase evidence | Master checklist can be checked only after evidence is present |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P06-1 | Future runs do not repeat the 2026-05-06 waste storm | `bash .claude/scripts/verify-phase-runner-boundary.sh` | fixture passes all waste suppression assertions | `.claude/verification-verdict-phase06-regression.json` |
| SCN-P06-2 | Runtime parity still passes after strict waste gates | `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan` | Codex/Claude parity checks pass | `.claude/runtime-verdict-phase06-parity.json` |
| SCN-P06-3 | Documentation points to the right active plan package | `bash .claude/scripts/knowledge-repo-audit.sh` | audit passes | `.claude/verification-verdict-phase06-doc-sync.json` |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P06-1 | fixture files if boundary script uses external fixtures | `.claude/scripts/verify-phase-runner-boundary.sh`, `.claude/scripts/verify-phase-runtime-parity.sh` | boundary and parity checks | `bash .claude/scripts/verify-phase-runner-boundary.sh` | RED: old waste pattern accepted; GREEN: suppressed |
| P06-2 | none | `.claude/docs/reference/codex-phase-runner-workflow.md`, `.claude/docs/reference/codex-phase-runner-workflow.html` | docs audit | `bash .claude/scripts/knowledge-repo-audit.sh` | GREEN: audit passes |
| P06-3 | none | `.claude/verification.contract.yaml` | workflow checks | `bash .claude/scripts/workflow-enforcement.sh verify` | GREEN: new artifacts recognized |

## Blockers And Review

- Blocker condition: runtime parity fixture mutates source reference plan.
- First review checkpoint: after P06-1, review fixture isolation and ensure prior completed plans stay untouched.
- Re-review trigger: any reference doc update that changes public entrypoint guidance.
- Verification evidence path: `.claude/verification-verdict-phase06-regression-doc-sync.json`.

## Validation Plan

- [ ] Boundary: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- [ ] Runtime parity: `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
- [ ] Workflow: `bash .claude/scripts/workflow-enforcement.sh verify`
- [ ] Knowledge audit: `bash .claude/scripts/knowledge-repo-audit.sh`
- [ ] Shell syntax: `bash -n .claude/scripts/verify-phase-runner-boundary.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh`

## Evidence to Mark Done

- Boundary verifier output.
- Runtime parity output.
- Knowledge audit output.
- Updated reference doc links.

## Deliverables

- Regression fixture and documentation sync.

## Phase Completion Checklist

- [ ] Waste-pattern regression fixture passes
- [ ] Reference docs explain new waste ledger and non-overlap rule
- [ ] Knowledge audit and workflow checks pass
- [ ] Master plan checklist can be updated with evidence

## Handoff Notes

- After this phase, future Moonshot phase-runner work should use this package as the active reference for waste suppression behavior.

