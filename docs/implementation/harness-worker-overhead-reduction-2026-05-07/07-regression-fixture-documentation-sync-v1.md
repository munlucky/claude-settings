# Phase 07: Regression Fixture And Documentation Sync (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HWO-006 | User overhead item 6 | Deprecated Codex `--full-auto` must stay removed | Add explicit CLI args regression guard |
| HWO-001-HWO-009 | User overhead items 1-9 | All overhead classes need regression coverage and docs index | Add cross-phase regression matrix and docs sync |
| HWO-012 | Prior NWFP/MWR baseline | Completed fixes should not reopen in future harness work | Update traceability and scenario matrix |

## Goal

- Lock all overhead-reduction behavior into regression tests and documentation so future harness changes do not reintroduce the same costs.

## Expected Outcome

- A regression suite covers verdict placeholder normalization, raw failure classification, prompt redaction, artifact writer idempotence, gate reason routing, runtime unavailable cache, and Codex CLI args.
- Execution traceability files map every HWO requirement to evidence.
- Knowledge repository audit passes after structural doc changes.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "closeout"
  dependsOn:
    - "01"
    - "02"
    - "03"
    - "04"
    - "05"
    - "06"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/failure-classifier.test.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/agent-loop-phase-plan.test.mjs"
    - "docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/REQUIREMENTS_TRACEABILITY.md"
    - "docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/SCENARIO_MATRIX.md"
  readOnlyPaths:
    - ".claude/scripts/runtime-cli.mjs"
    - ".claude/scripts/agent-loop-phase-runtime.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/docs/guidelines/"
  sharedMutablePaths:
    - ".claude/docs/guidelines/meta-harness-optimization.md"
  requiresManualEvidence: false
  mergePolicy: "sequential_closeout"
```

## Scope

- In scope:
  - Add or update tests that protect each phase behavior.
  - Add Codex CLI regression check for `--sandbox workspace-write` and absence of `--full-auto`.
  - Create or refresh package-level `execution/REQUIREMENTS_TRACEABILITY.md` and `execution/SCENARIO_MATRIX.md`.
  - Update relevant guideline/index docs only if they already reference harness optimization or waste reduction.
  - Run repository audit after structural documentation changes.
- Out of scope:
  - Staging or committing changes.
  - Preparing `.claude/docs/phase-status.yaml` for execution unless the user explicitly asks.
  - Editing completed prior package artifacts.

## Preconditions And Inputs

- Phases 01-06 are merged and verified.
- Required current code:
  - `.claude/scripts/runtime-cli.mjs`
  - `.claude/scripts/lib/failure-classifier.test.mjs`
  - `.claude/scripts/verify-phase-closeout.test.mjs`
  - `.claude/scripts/agent-loop-phase-artifacts.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P07-1 | Add regression matrix | Add tests or self-tests for each HWO requirement | Every source requirement has a command-backed evidence path |
| P07-2 | Add Codex CLI guard | Assert `codex-base-args` includes `--sandbox workspace-write` and excludes `--full-auto` | CLI drift fails tests |
| P07-3 | Refresh traceability docs | Write package `REQUIREMENTS_TRACEABILITY.md` and `SCENARIO_MATRIX.md` | Every HWO and SCN is mapped to pass/pending evidence |
| P07-4 | Run audit and closeout checks | Run knowledge repo audit and core harness tests | Audit and tests pass or documented blockers remain |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P07-1 | Deprecated `--full-auto` cannot silently return | `node .claude/scripts/runtime-cli.mjs codex-base-args /Users/dev/claude-settings` plus regression assertion | output includes `--sandbox workspace-write`; output excludes `--full-auto` | `QA_REPORT.md` command output |
| SCN-P07-2 | All overhead classes have regression coverage | package scenario matrix review plus listed test commands | each HWO row has evidence or explicit blocker | `execution/SCENARIO_MATRIX.md` |
| SCN-P07-3 | Documentation index stays coherent after new package | `.claude/scripts/knowledge-repo-audit.sh` | audit exits 0 | `QA_REPORT.md` audit output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P07-1 | `docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/REQUIREMENTS_TRACEABILITY.md`, `docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/SCENARIO_MATRIX.md` | relevant test files | touched tests | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | Exit 0 with raw fixture coverage |
| P07-2 | none | existing or new runtime CLI test fixture | `.claude/scripts/runtime-cli.mjs` | `node .claude/scripts/runtime-cli.mjs codex-base-args /Users/dev/claude-settings` | no `--full-auto`; has `--sandbox workspace-write` |
| P07-3 | traceability docs | optional guideline/index doc if needed | docs audit | `.claude/scripts/knowledge-repo-audit.sh` | Exit 0 |
| P07-4 | none | none | full closeout checks | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Exit 0 |

## Blockers And Review

- Blocker condition: A requirement has no command-backed evidence and no explicit blocker.
- First review checkpoint: Review traceability matrix before marking master checklist complete.
- Re-review trigger: Any regression fixture uses log string paraphrases instead of raw observed strings.
- Verification evidence path: `docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/07-phase-07-regression-fixture-documentation-sync-v1/QA_REPORT.md`

## Validation Plan

- [ ] `node --test .claude/scripts/lib/failure-classifier.test.mjs`
- [ ] `node .claude/scripts/verification-verdict-state.mjs self-test`
- [ ] `node .claude/scripts/agent-loop-phase-state.mjs self-test`
- [ ] `node .claude/scripts/agent-loop-phase-artifacts.mjs self-test`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `node .claude/scripts/runtime-cli.mjs codex-base-args /Users/dev/claude-settings`
- [ ] `.claude/scripts/knowledge-repo-audit.sh`

## Evidence To Mark Done

- Test command outputs.
- Traceability and scenario matrix entries.
- Audit output.
- Final master checklist update with evidence links.

## Deliverables

- Regression coverage for all HWO requirements.
- Package-level traceability artifacts.
- Documentation/audit sync.

## Phase Completion Checklist

- [ ] Every HWO requirement has regression evidence.
- [ ] Codex `--full-auto` regression guard exists.
- [ ] Traceability and scenario matrix are current.
- [ ] Knowledge repo audit passes.

## Handoff Notes

- After this phase, the package can be prepared for execution only if the user explicitly asks to run it through `moonshot-phase-runner`.
