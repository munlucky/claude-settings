# Phase 02: Browser Flow Runner MVP (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-001 | Methodology executive summary | Verify rendered output and interactions in a closed loop | Add executable browser flow runner |
| SRC-003 | Browser verification | Prefer DOM/accessibility automation, supplement with screenshots | Use `browserctl`/Playwright snapshots and screenshots |
| SRC-004 | Visual regression | Store screenshot artifacts and prepare baseline comparison | Capture deterministic screenshots and result metadata |
| SRC-007 | Current browserd runtime | Reuse existing browser runtime | Integrate with `.claude/bin/browserctl` |

## Goal
- Implement a small runner that reads declared browser flows and produces structured runtime evidence for critical frontend scenarios.

## Expected Outcome
- A command can execute one or more `runtime.browserFlows` entries.
- The runner writes a JSON artifact containing flow status, action results, screenshots, console/network summaries, and evidence depth.
- `verify-runtime.sh` can call the runner when frontend flows are declared or explicitly requested.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "frontend-runtime"
  dependsOn:
    - "01"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/browser-flow-runner.mjs"
    - ".claude/agents/verification/verify-runtime.sh"
    - ".claude/skills/browser-verifier/SKILL.md"
    - ".claude/tools/browserd/**"
    - "docs/implementation/frontend-ai-harness-mvp-2026-05-08/**"
  readOnlyPaths:
    - ".claude/docs/guidelines/verification-contract.ko.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "small_serial_patch"
```

## Scope
- In scope:
  - Parse the minimal contract fields from Phase 01.
  - Run `goto`, `snapshot`, `click`, `type`, `screenshot`, `console`, and `network` through `browserctl`.
  - Support role/name based lookup when snapshot labels are sufficient.
  - Write `.claude/browser-flow-verdict-<runId>.json`.
  - Distinguish `smoke`, `open-act`, and `open-act-mutate-persist-recover` evidence depth.
- Out of scope:
  - Pixel diff baseline comparison.
  - Full Playwright test generation.
  - Complex selectors beyond the MVP target model.

## Minimal Flow Runner Contract
```yaml
browserFlowVerdict:
  runId: "browser-flow-..."
  status: "passed | failed | setup_gap"
  targetUrl: "http://localhost:3000/dashboard"
  flowName: "dashboard-filter-critical"
  critical: true
  evidenceDepth: "smoke | open-act | open-act-mutate-persist-recover"
  steps:
    - index: 1
      action: "click"
      status: "passed"
      targetRef: "@e1"
  artifacts:
    screenshot: ".claude/browser-artifacts/dashboard-filter-critical.png"
    console: ".claude/browser-artifacts/dashboard-filter-critical-console.json"
    network: ".claude/browser-artifacts/dashboard-filter-critical-network.json"
  setupGaps: []
  failures: []
```

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Add browser flow runner | Create `browser-flow-runner.mjs` with contract parsing, flow selection, and browserctl command execution | Self-test flow against data/file URL can produce verdict JSON |
| P02-2 | Connect verify-runtime | Add optional runner invocation when frontend browser flows are declared | Runtime verdict links browser flow verdict |
| P02-3 | Improve evidence classification | Map runner output to smoke/open-act/deep evidence | Critical smoke-only scenarios remain warnings or failures per profile |
| P02-4 | Document browser-verifier behavior | Update skill docs to mention frontend flow artifacts | Caller knows artifact paths and setup-gap behavior |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | Browser flow runner can navigate, inspect, act, and capture evidence | `node .claude/scripts/browser-flow-runner.mjs self-test` | JSON verdict with `status: passed` | `.claude/browser-flow-verdict-*.json` |
| SCN-02-2 | Runtime verifier surfaces browser flow result | `.claude/agents/verification/verify-runtime.sh --url=data:text/html,<button>OK</button> --browser-flow=self-test` | Runtime verdict includes browser flow status | `.claude/runtime-verdict-*.json` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P02-1 | `.claude/scripts/browser-flow-runner.mjs` | none | runner | `node .claude/scripts/browser-flow-runner.mjs self-test` | exit 0, verdict JSON |
| P02-2 | none | `.claude/agents/verification/verify-runtime.sh` | verifier | `bash -n .claude/agents/verification/verify-runtime.sh` | exit 0 |
| P02-3 | none | `.claude/skills/browser-verifier/SKILL.md` | docs | `bash .claude/scripts/knowledge-repo-audit.sh` | exit 0 |

## Blockers And Review
- Blocker condition: `browserctl` cannot provide snapshot/screenshot in the active environment and no safe setup-gap verdict can be written.
- First review checkpoint: after runner verdict shape is implemented.
- Re-review trigger: any change to `verify-runtime.sh` exit-code behavior.
- Verification evidence path: runner verdict JSON plus runtime verdict JSON.

## Validation Plan
- [ ] Syntax: `node --check .claude/scripts/browser-flow-runner.mjs`
- [ ] Self-test: `node .claude/scripts/browser-flow-runner.mjs self-test`
- [ ] Shell syntax: `bash -n .claude/agents/verification/verify-runtime.sh`
- [ ] Runtime integration: run `verify-runtime.sh` with a minimal local or data URL flow.

## Evidence to Mark Done
- Runner verdict artifact.
- Runtime verdict artifact linking or summarizing runner status.
- Browser-verifier documentation update.

## Deliverables
- Executable browser flow runner MVP.
- Runtime verifier integration.

## Phase Completion Checklist
- [ ] Flow runner exists and self-tests
- [ ] Runtime verifier can invoke or report setup gap
- [ ] Verdict artifact includes evidence depth
- [ ] Validation checks pass

## Handoff Notes
- Phase 03 consumes the runner verdict and decides how to score missing visual/a11y/perf evidence.

