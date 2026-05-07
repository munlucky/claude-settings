# Phase 02: Failure Classifier Raw Runtime Taxonomy (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HWO-004 | User overhead item 4 | MCP process group cleanup EPERM must not remain noisy unknown failure | Add raw-string patterns and fixtures |
| HWO-005 | User overhead item 5 | MemoryGraph `Transport closed` must classify as unavailable | Preserve and expand memorygraph raw fixture coverage |
| HWO-007 | User overhead item 7 | network/plugin/PATH startup warnings must classify once | Add raw network/plugin/path update patterns |
| HWO-012 | Prior NWFP-009/NWFP-010 | Same environment failures suppress retries | Ensure classified codes use no-retry or one-shot fallback policy |

## Goal

- Ensure every user-listed raw runtime warning string maps to a stable failure code and retry policy.

## Expected Outcome

- `Failed to terminate MCP process group ... Operation not permitted` maps to `mcp_cleanup_eperm`.
- `Could not resolve host: github.com` and plugin sync failures map to network/plugin codes.
- `could not update PATH: Operation not permitted` maps to `path_update_denied`.
- Existing MemoryGraph, Codex storage, Git, Bash, Node, rg, verifier, and spawn blockers remain covered.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn:
    - "01"
  conflictsWith:
    - "05"
    - "06"
  ownedPaths:
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/lib/failure-classifier.test.mjs"
    - ".claude/scripts/agent-loop-phase-runtime.mjs"
  readOnlyPaths:
    - ".claude/scripts/phase-capability-preflight.mjs"
    - ".claude/scripts/agent-loop-phase-attempt.mjs"
    - "docs/implementation/moonshot-harness-waste-reduction-2026-05-06/WASTE_REGISTER.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness"
```

## Scope

- In scope:
  - Add raw-string classifier fixtures copied from user-observed logs.
  - Distinguish cleanup noise, network/plugin fetch failure, PATH mutation denial, and general network fetch failure.
  - Keep environment blockers out of implementation auto-fix loops through existing `isEnvironmentStopReason` consumers.
  - Ensure `detectFinalStopReason` can return stable environment codes when the log contains these strings.
- Out of scope:
  - Adding new external network probes.
  - Changing Docker optional warning behavior unless it is directly needed for no-retry consistency.
  - Rewriting historical capability reports.

## Preconditions And Inputs

- Phase 01 verdict contract is merged.
- Required current code:
  - `.claude/scripts/lib/failure-classifier.mjs`
  - `.claude/scripts/lib/failure-classifier.test.mjs`
  - `.claude/scripts/agent-loop-phase-runtime.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P02-1 | Add raw classifier patterns | Extend regexes for MCP terminate/kill, PATH update denied, plugin sync failed, could-not-resolve-host | Raw observed strings no longer map to `unknown_failure` |
| P02-2 | Add fixture matrix | Add tests for every raw string from the overhead list | `node --test .claude/scripts/lib/failure-classifier.test.mjs` passes |
| P02-3 | Wire stop reason detection | Ensure `detectFinalStopReason` sees these strings as environment/network stop reasons | Nonzero worker logs stop as stable blocker instead of broad auto-fix |
| P02-4 | Preserve retry policy | Confirm no-retry environment/network codes do not become retryable implementation failures | Attempt decisions return stop-loop or controlled fallback |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P02-1 | MCP cleanup EPERM is summarized as environment cleanup noise | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | raw terminate/kill process group fixture maps to `mcp_cleanup_eperm` | `QA_REPORT.md` test output |
| SCN-P02-2 | Offline plugin sync does not trigger implementation retry | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | `Could not resolve host: github.com` fixture maps to network/plugin code | `QA_REPORT.md` test output |
| SCN-P02-3 | PATH update denial becomes stable blocker/warning metadata | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | PATH raw fixture maps to `path_update_denied` | `QA_REPORT.md` test output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P02-1 | none | `.claude/scripts/lib/failure-classifier.mjs` | `.claude/scripts/lib/failure-classifier.test.mjs` | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | Before fix: raw strings unknown; after fix: stable codes |
| P02-2 | none | `.claude/scripts/lib/failure-classifier.test.mjs` | same | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | Exit 0 |
| P02-3 | none | `.claude/scripts/agent-loop-phase-runtime.mjs` | inline or test fixture if added | `node --check .claude/scripts/agent-loop-phase-runtime.mjs` | Exit 0; stop detection returns stable code in fixture |
| P02-4 | none | `.claude/scripts/agent-loop-phase-attempt.mjs` only if needed | none | `node .claude/scripts/agent-loop-phase-attempt.mjs decide-failure-action 1 3 true false mcp_cleanup_eperm` | `ACTION='stop-loop'` |

## Blockers And Review

- Blocker condition: A product verifier failure string starts mapping to environment/no-retry by accident.
- First review checkpoint: Review raw regexes for over-broad network and PATH patterns.
- Re-review trigger: Any regex that matches generic `failed` without a concrete subsystem token.
- Verification evidence path: `docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/02-phase-02-failure-classifier-raw-runtime-taxonomy-v1/QA_REPORT.md`

## Validation Plan

- [ ] `node --test .claude/scripts/lib/failure-classifier.test.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-runtime.mjs`
- [ ] Attempt decision command for representative environment codes.
- [ ] `node .claude/scripts/phase-capability-preflight.mjs --json`

## Evidence To Mark Done

- Classifier fixture output.
- Stop-reason/attempt-decision output for at least one no-retry code.
- Preflight JSON still emits current environment summary.

## Deliverables

- Expanded raw runtime taxonomy.
- Regression fixtures for observed raw warning strings.
- Stable no-retry behavior for classified runtime noise.

## Phase Completion Checklist

- [ ] All user-listed raw warning strings classify to non-unknown codes.
- [ ] Environment/no-retry codes do not launch broad implementation auto-fix.
- [ ] Existing classifier fixtures still pass.
- [ ] Runtime syntax/preflight checks pass.

## Handoff Notes

- Phase 03 should redact prompt payloads without removing the stable classifier evidence needed by Phase 02.
