# Phase 04: Visual Diff Gate Post-MVP (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-001 | Methodology executive summary | Frontend verification must evaluate rendered output | Convert screenshot evidence into diff-based pass/fail evidence |
| SRC-004 | Methodology visual regression | Store screenshots, baselines, diffs, masks, and breakpoint evidence | Add visual diff runner and artifact contract |
| SRC-006 | Current harness contract | Completion requires fresh evidence and scorecard agreement | Feed visual diff verdict into scorecard/completion gates |
| SRC-007 | Current browserd runtime | Reuse existing browser runtime | Use Phase 02 screenshot capture as the input image source |

## Goal
- Extend the MVP screenshot evidence path into a deterministic visual diff gate that can fail required frontend scenarios when rendered output changes beyond an allowed threshold.

## Expected Outcome
- A visual diff runner compares current screenshots against declared baselines.
- The runner writes structured JSON plus optional diff images.
- `browser-flow-runner` or `verify-runtime.sh` can link visual diff verdicts into runtime evidence.
- `OBJ-VIS` can pass, fail, or report setup gaps from machine-readable visual evidence.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "frontend-visual-diff"
  dependsOn:
    - "01"
    - "02"
    - "03"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/visual-diff-runner.mjs"
    - ".claude/scripts/browser-flow-runner.mjs"
    - ".claude/agents/verification/verify-runtime.sh"
    - ".claude/docs/guidelines/verification-contract.ko.md"
    - ".claude/templates/execution/SCORECARD.template.md"
    - ".claude/templates/execution/SCENARIO_MATRIX.template.md"
    - "docs/implementation/frontend-ai-harness-mvp-2026-05-08/**"
  readOnlyPaths:
    - ".claude/tools/browserd/**"
    - ".claude/bin/browserctl"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "small_serial_patch"
```

## Scope
- In scope:
  - Compare captured screenshots to declared baseline files.
  - Support threshold-based failure with `maxDiffRatio`.
  - Support breakpoint-specific baseline names.
  - Write diff image artifacts when possible.
  - Represent missing baselines as `setup_gap`, not a fake pass.
  - Feed visual status into `OBJ-VIS` and scenario matrix evidence.
- Out of scope:
  - SaaS visual review UI.
  - AI vision critique scoring.
  - Automatic baseline approval.
  - Complex region masks beyond a basic ignore-region schema.

## Proposed Contract Extension
```yaml
frontend:
  visual:
    requiredForCriticalScenarios: true
    maxDiffRatio: 0.01
    baselinesRoot: "tests/visual-baselines"
    diffsRoot: ".claude/browser-artifacts/visual-diffs"
    breakpoints:
      - width: 390
        height: 844
        name: "mobile"
      - width: 768
        height: 1024
        name: "tablet"
      - width: 1440
        height: 960
        name: "desktop"
    ignoreRegions:
      - name: "timestamp"
        selector: "[data-visual-ignore='timestamp']"
runtime:
  browserFlows:
    - name: "dashboard-filter-critical"
      critical: true
      visual:
        required: true
        baseline: "dashboard-filter-critical-desktop.png"
        maxDiffRatio: 0.01
```

## Visual Diff Verdict Shape
```yaml
visualDiffVerdict:
  runId: "visual-diff-..."
  status: "passed | failed | setup_gap"
  flowName: "dashboard-filter-critical"
  currentScreenshot: ".claude/browser-artifacts/current.png"
  baselineScreenshot: "tests/visual-baselines/dashboard-filter-critical-desktop.png"
  diffImage: ".claude/browser-artifacts/visual-diffs/dashboard-filter-critical-desktop.diff.png"
  maxDiffRatio: 0.01
  actualDiffRatio: 0.004
  changedPixels: 120
  totalPixels: 30000
  breakpoint: "desktop"
  setupGaps: []
  failures: []
```

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Add visual diff runner | Create `visual-diff-runner.mjs` with image comparison, threshold handling, and JSON verdict output | Self-test can compare identical and different sample images |
| P04-2 | Connect browser flow artifacts | Pass current screenshot paths from browser flow verdict to visual diff runner | Browser flow verdict links visual diff verdict |
| P04-3 | Update contract docs | Document baseline path, breakpoint, threshold, and setup-gap semantics | Downstream projects can opt in without ambiguity |
| P04-4 | Update templates/gates | Make `OBJ-VIS` consume pass/fail/setup-gap states | Required visual diff failure blocks clean completion |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | Identical screenshots pass visual diff | `node .claude/scripts/visual-diff-runner.mjs self-test --case=identical` | `status: passed`, `actualDiffRatio: 0` | `.claude/visual-diff-verdict-*.json` |
| SCN-04-2 | Changed screenshots fail when over threshold | `node .claude/scripts/visual-diff-runner.mjs self-test --case=changed` | `status: failed`, diff image path recorded | `.claude/browser-artifacts/visual-diffs/**` |
| SCN-04-3 | Missing baseline is a setup gap, not a pass | `node .claude/scripts/visual-diff-runner.mjs self-test --case=missing-baseline` | `status: setup_gap`, completion remains blocked if visual is required | `.claude/visual-diff-verdict-*.json` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P04-1 | `.claude/scripts/visual-diff-runner.mjs` | none | runner | `node --check .claude/scripts/visual-diff-runner.mjs` | exit 0 |
| P04-1b | sample self-test artifacts under ignored `.claude/browser-artifacts` | none | runner self-test | `node .claude/scripts/visual-diff-runner.mjs self-test --case=identical` | pass verdict |
| P04-2 | none | `.claude/scripts/browser-flow-runner.mjs`, `.claude/agents/verification/verify-runtime.sh` | runtime integration | `bash -n .claude/agents/verification/verify-runtime.sh` | exit 0 |
| P04-3 | none | `.claude/docs/guidelines/verification-contract.ko.md` | docs | `bash .claude/scripts/knowledge-repo-audit.sh` | exit 0 |
| P04-4 | none | `.claude/templates/execution/SCORECARD.template.md`, `.claude/templates/execution/SCENARIO_MATRIX.template.md` | templates | `bash .claude/scripts/knowledge-repo-audit.sh` | exit 0 |

## Blockers And Review
- Blocker condition: no safe image comparison library is available locally and adding a dependency is not approved.
- First review checkpoint: after choosing the image comparison implementation.
- Re-review trigger: any change to visual failure threshold semantics or baseline update policy.
- Verification evidence path: visual diff verdict JSON and knowledge audit JSON.

## Validation Plan
- [ ] Syntax: `node --check .claude/scripts/visual-diff-runner.mjs`
- [ ] Identical self-test passes.
- [ ] Changed self-test fails above threshold.
- [ ] Missing baseline self-test reports setup gap.
- [ ] Knowledge audit passes after docs/template changes.

## Evidence to Mark Done
- Visual diff runner verdicts for pass, fail, and setup-gap cases.
- Runtime/browser flow verdict linking current screenshot to visual diff result.
- Updated contract and scorecard documentation.

## Deliverables
- Visual diff runner MVP.
- Visual diff contract extension.
- Visual diff scorecard and scenario matrix integration.

## Phase Completion Checklist
- [ ] Visual diff runner exists and self-tests
- [ ] Required visual diff failure blocks clean completion
- [ ] Missing baseline is represented as setup gap
- [ ] Diff artifacts are linked from verdict JSON
- [ ] Validation checks pass

## Handoff Notes
- Future phases can add axe/keyboard and Lighthouse/performance gates using the same verdict pattern.
- Baseline approval should remain human-controlled; do not auto-update baselines as part of the runner.

