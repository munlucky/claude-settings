# Phase 06: Artifact Projection From Sidecar (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-7.1 | v8 Artifact Projection | QA/HANDOFF/SCORECARD are rendered projections, not blocker truth sources. | Render current summary from sidecar data. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-10 | REQ-7.1 | Tests prove concrete blocker details survive HANDOFF/QA/SCORECARD regeneration. |

## Goal
- Stop Markdown regeneration from weakening concrete blocker detail.

## Expected Outcome
- `HANDOFF.md`, `QA_REPORT.md`, and `SCORECARD.md` are safe projections of sidecar state.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "01"
    - "04"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/blocker-sidecar-state.mjs"
    - ".claude/scripts/lib/terminal-blocker-publisher.mjs"
  sharedMutablePaths:
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_renderer_contract"
```

## Scope
- In scope:
  - Load sidecar current blocker summary in artifact writer.
  - Render concrete blocker fields in HANDOFF and QA.
  - Keep generic `deferred_verification` only when no concrete blocker exists.
  - Add projection consistency metadata.
- Out of scope:
  - Verifier canonical sidecar adoption.

## Preconditions and Inputs
- Phase 01 sidecar reader exists.
- Phase 04 publisher defines record fields.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P06-1 | Add sidecar-backed rendering | 1) Load latest blocker states. 2) Select active blocker details. 3) Render into HANDOFF/QA/SCORECARD. | Concrete blocker fields appear in regenerated artifacts. |
| P06-2 | Preserve generic fallback boundary | 1) If no sidecar and no concrete blocker, preserve legacy generic handling. 2) If sidecar exists, do not invent legacy truth. | Legacy no-sidecar artifacts still render. |
| P06-3 | Add regression tests | 1) Seed sidecar with `spawn_eperm`. 2) Regenerate handoff. 3) Assert command/stderr/verdict path remain. | Test fails on template overwrite behavior and passes after fix. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-06-1 | HANDOFF does not replace `spawn EPERM` detail with generic deferred text. | `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs` | concrete blocker projection fixture passes. | `.claude/scripts/agent-loop-phase-artifacts.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P06-1 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs` | artifact tests | `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: artifact writer cannot resolve phase execution dir for the active phase.
- First review checkpoint: after renderer output format is chosen.
- Re-review trigger: HANDOFF template starts storing canonical blocker state again.
- Verification evidence path: `docs/implementation/blocker-closeout-prevention-2026-05-12/execution/blocker-closeout-prevention-v1/06-artifact-projection-sidecar/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-artifacts.mjs`

## Deliverables
- Sidecar-backed artifact renderer.
- Regression test for concrete blocker preservation.

## Phase Completion Checklist
- [ ] Markdown is projection only.
- [ ] Concrete blocker fields survive regeneration.
- [ ] Legacy generic fallback still works when no sidecar exists.

## Handoff Notes
- Phase 07 should treat Markdown as consistency evidence only.
