# Phase 03: Frontend Evidence Gates and Scorecard MVP (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-001 | Methodology executive summary | Completion requires layered frontend verification | Add frontend evidence consumption to gates |
| SRC-004 | Visual regression | Screenshots and diffs should affect pass/block decisions | Add visual evidence fields and scorecard category |
| SRC-005 | A11y/perf gate | Accessibility and performance are gates | Add a11y/perf scorecard and template expectations |
| SRC-006 | Current harness contract | Completion requires fresh evidence and scorecard done | Preserve completion-verifier semantics |

## Goal
- Teach the harness closeout layer how to consume frontend evidence from Phase 02 and prevent strong completion claims when required UI evidence is missing.

## Expected Outcome
- `SCORECARD.template.md` has a concrete `frontend` preset.
- `SCENARIO_MATRIX.template.md` can record visual, accessibility, and performance evidence per critical scenario.
- `completion-verifier` and `verification-evidence-gate` rules mention frontend evidence gaps explicitly.
- `QA_REPORT` guidance records frontend setup gaps and evidence depth.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "frontend-gates"
  dependsOn:
    - "01"
    - "02"
  conflictsWith: []
  ownedPaths:
    - ".claude/templates/execution/SCORECARD.template.md"
    - ".claude/templates/execution/SCENARIO_MATRIX.template.md"
    - ".claude/templates/execution/QA_REPORT.template.md"
    - ".claude/skills/completion-verifier/SKILL.md"
    - ".claude/skills/verification-evidence-gate/SKILL.md"
    - ".claude/docs/guidelines/requirements-traceability-harness.md"
    - "docs/implementation/frontend-ai-harness-mvp-2026-05-08/**"
  readOnlyPaths:
    - ".claude/scripts/browser-flow-runner.mjs"
    - ".claude/agents/verification/verify-runtime.sh"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "small_serial_patch"
```

## Scope
- In scope:
  - Add frontend scorecard categories: `VIS`, `A11Y`, `PERF`.
  - Require visual/a11y/perf evidence only when declared by contract or critical scenario policy.
  - Record setup gaps as blocking only when required evidence is missing.
  - Keep `uat_ready` and `uat_complete` separate.
- Out of scope:
  - Implementing Lighthouse or axe internals.
  - Adding hosting-specific preview deployment.
  - Creating a full UI audit scoring model.

## Proposed Frontend Scorecard Preset
| ID | Category | Weight | Pass Condition |
|----|----------|--------|----------------|
| OBJ-CONFORM | Source plan conformance | 10 | Source requirements and approved deviations reconciled |
| OBJ-REQ | Requirements covered | 15 | In-scope `REQ-*` implemented and verified |
| OBJ-SCN | Critical user scenarios evidenced | 20 | Critical `SCN-*` has fresh browser/E2E evidence |
| OBJ-VIS | Visual evidence | 15 | Required screenshots or visual checks pass, or setup gap blocks |
| OBJ-A11Y | Accessibility evidence | 15 | Required axe/keyboard checks pass, or setup gap blocks |
| OBJ-PERF | Performance evidence | 10 | Required perf budget checks pass, or setup gap blocks |
| OBJ-VER | Required commands passed | 10 | Contract required checks passed with fresh evidence |
| OBJ-CLOSE | Review and closeout recorded | 5 | QA, handoff, and review disposition are current |

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Update scorecard template | Add frontend preset and scoring rules | Template distinguishes visual/a11y/perf from generic verification |
| P03-2 | Update scenario matrix | Add evidence columns for flow depth, screenshot, a11y, perf | Critical scenario rows can show exact missing evidence |
| P03-3 | Update verifier gate docs | Completion-verifier and evidence gate block missing required frontend evidence | No strong completion wording when required UI evidence is absent |
| P03-4 | Update QA report guidance | Add frontend evidence summary/setup-gap section | QA report can drive remediation loop |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | A critical frontend scenario cannot close with smoke-only evidence when visual/a11y/perf is required | `bash .claude/scripts/knowledge-repo-audit.sh` plus verifier doc review | Docs and templates encode blocking rule | Updated templates and skill docs |
| SCN-03-2 | Frontend scorecard can represent partial evidence without fake pass | `node .claude/scripts/verify-phase-closeout.mjs --help` or targeted scorecard parser check if available | No template syntax regression | `SCORECARD.md` template |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P03-1 | none | `.claude/templates/execution/SCORECARD.template.md` | template | `bash .claude/scripts/knowledge-repo-audit.sh` | exit 0 |
| P03-2 | none | `.claude/templates/execution/SCENARIO_MATRIX.template.md` | template | `bash .claude/scripts/knowledge-repo-audit.sh` | exit 0 |
| P03-3 | none | `.claude/skills/completion-verifier/SKILL.md`, `.claude/skills/verification-evidence-gate/SKILL.md` | docs | `bash .claude/scripts/knowledge-repo-audit.sh` | exit 0 |

## Blockers And Review
- Blocker condition: scorecard changes make existing non-frontend profiles ambiguous or break current completion gate parsing.
- First review checkpoint: after frontend preset weights are added.
- Re-review trigger: any change to generic scorecard rules.
- Verification evidence path: knowledge audit JSON and any targeted closeout parser check.

## Validation Plan
- [ ] Knowledge audit: `bash .claude/scripts/knowledge-repo-audit.sh`
- [ ] Shell syntax baseline remains valid for verifier scripts.
- [ ] Existing generic scorecard rules remain understandable and unchanged.

## Evidence to Mark Done
- Updated scorecard template.
- Updated scenario matrix template.
- Updated completion gate docs.
- Audit output.

## Deliverables
- Frontend evidence closeout semantics.
- Frontend scorecard preset.
- Scenario matrix evidence columns.

## Phase Completion Checklist
- [ ] Frontend scorecard preset added
- [ ] Scenario matrix can record visual/a11y/perf evidence
- [ ] Completion verifier docs block missing required frontend evidence
- [ ] Validation checks pass

## Handoff Notes
- Post-MVP work should add real visual diff, axe, Lighthouse, preview deploy, and canary integrations as separate opt-in phases.

