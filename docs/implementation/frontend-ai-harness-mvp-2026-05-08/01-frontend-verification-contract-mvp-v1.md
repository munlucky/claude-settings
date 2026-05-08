# Phase 01: Frontend Verification Contract MVP (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-001 | Methodology executive summary | Frontend work needs closed-loop verification | Add frontend verification contract fields |
| SRC-002 | Implementation guide | Declare unit/story/E2E/visual/a11y/perf/policy checks | Extend contract docs and examples |
| SRC-005 | A11y/perf gate | Treat a11y/perf as explicit gates | Add optional/required check names and budget fields |
| SRC-006 | Current harness contract | Preserve current contract-first verification behavior | Keep backward-compatible fields |

## Goal
- Define the minimum frontend verification contract shape that downstream projects can opt into without changing the public workflow surface.

## Expected Outcome
- `.claude/docs/guidelines/verification-contract.ko.md` documents frontend-specific checks.
- `.claude/verification.contract.yaml` or a reusable example documents the new fields.
- Existing projects without frontend fields continue to behave the same.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "frontend-contract"
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - ".claude/docs/guidelines/verification-contract.ko.md"
    - ".claude/docs/guidelines/verification-contract.md"
    - ".claude/verification.contract.yaml"
    - "docs/implementation/frontend-ai-harness-mvp-2026-05-08/**"
  readOnlyPaths:
    - ".claude/agents/verification/verify-runtime.sh"
    - ".claude/skills/browser-verifier/SKILL.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "small_serial_patch"
```

## Scope
- In scope:
  - Add frontend command names: `storybookTest`, `playwrightVisual`, `axeA11y`, `lighthouse`, `frontendRuntime`.
  - Add `runtime.previewUrl`, `runtime.browserFlows[].steps`, `runtime.browserFlows[].assertions`, `runtime.browserFlows[].artifacts`.
  - Add optional `frontend` block for `visual`, `accessibility`, and `performance` budgets.
  - Document setup-gap semantics for missing optional tools.
- Out of scope:
  - Implementing runner behavior.
  - Installing dependencies in downstream projects.
  - Making all checks globally required.

## Proposed Contract Shape
```yaml
commands:
  storybookTest: "npm run storybook:test"
  playwrightVisual: "npm run test:visual"
  axeA11y: "npm run test:a11y"
  lighthouse: "npm run test:perf"
runtime:
  url: "http://localhost:3000"
  previewUrl: ""
  e2eCommand: "npm run test:e2e"
  browserFlows:
    - name: "dashboard-filter-critical"
      critical: true
      entry: "/dashboard"
      viewport:
        width: 390
        height: 844
      steps:
        - action: "click"
          target:
            role: "button"
            name: "Filter"
        - action: "assertVisible"
          target:
            role: "dialog"
            name: "Filter"
      assertions:
        - kind: "url"
          mode: "same-origin"
        - kind: "console"
          maxErrors: 0
      artifacts:
        screenshot: true
        console: true
        network: true
frontend:
  visual:
    requiredForCriticalScenarios: true
    maxDiffRatio: 0.01
    breakpoints: [390, 768, 1440]
  accessibility:
    requiredForCriticalScenarios: true
    axe: "required_when_available"
    keyboardFlow: "required_for_dialogs_and_menus"
  performance:
    requiredForCriticalScenarios: false
    budgets:
      lcpMs: 2500
      cls: 0.1
      inpMs: 200
policy:
  requiredChecks:
    - build
    - runtime
  optionalChecks:
    - storybookTest
    - playwrightVisual
    - axeA11y
    - lighthouse
```

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Document frontend fields | Update verification contract guide with schema, meanings, and setup-gap rules | Guide includes contract sample and completion semantics |
| P01-2 | Add example contract fields | Add commented or documented frontend example without forcing global checks | Existing meta-harness required checks stay unchanged |
| P01-3 | Define check names | Normalize check names across docs, templates, and verifier expectations | One canonical name per check |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | A downstream frontend task can declare browser, visual, a11y, and perf expectations in a contract | `bash .claude/scripts/knowledge-repo-audit.sh` | Audit passes after docs update | `.claude/knowledge-repo-audit-*.json` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P01-1 | none | `.claude/docs/guidelines/verification-contract.ko.md` | docs | `bash .claude/scripts/knowledge-repo-audit.sh` | exit 0 |
| P01-2 | optional example doc | `.claude/verification.contract.yaml` only if meta contract needs docs-only comment-free fields | contract | `bash -n .claude/agents/verification/verify-runtime.sh` | exit 0 |

## Blockers And Review
- Blocker condition: contract field names collide with existing check names or make meta-harness strict checks accidentally require frontend tools.
- First review checkpoint: after schema names are drafted, before modifying verifier scripts.
- Re-review trigger: any change to required policy checks.
- Verification evidence path: latest knowledge audit JSON and shell syntax output.

## Validation Plan
- [ ] Documentation integrity: `bash .claude/scripts/knowledge-repo-audit.sh`
- [ ] Shell syntax unaffected: `bash -n .claude/agents/verification/verify-runtime.sh`
- [ ] Contract remains backward compatible for repositories without `frontend` fields.

## Evidence to Mark Done
- Updated verification contract guide.
- Knowledge audit output.
- Explicit note that frontend checks are opt-in unless required by downstream contract.

## Deliverables
- Frontend verification contract schema and example.

## Phase Completion Checklist
- [ ] Frontend fields documented
- [ ] Setup-gap semantics documented
- [ ] Backward compatibility documented
- [ ] Validation checks pass

## Handoff Notes
- Phase 02 consumes the final `runtime.browserFlows` shape and should not invent a second schema.

