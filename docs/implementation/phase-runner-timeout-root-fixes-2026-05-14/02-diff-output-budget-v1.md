# Phase 02: Diff Output Budget

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "timeout-root-fixes"
  dependsOn:
    - "01-diagnostic-search-budget-v1.md"
  conflictsWith:
    - "04-timeout-ledger-policy-v1.md"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/agent-loop-phase-runtime.mjs"
    - ".claude/scripts/agent-loop-phase-runtime.test.mjs"
    - ".claude/scripts/token-safe-git.sh"
  readOnlyPaths:
    - ".claude/logs/agent-loop"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- OBS-2: worker timed out after raw `diff --git` output began.
- OBS-3: recovery loop timed out again after failed test context and repeated raw diff output.
- REQ-2, REQ-5, AC-2, AC-3, AC-7.

## Goal

Preserve required git evidence while preventing unbounded raw diff output from consuming runner time and transcript budget.

## Scope

- Update runner prompts and helper commands to prefer bounded git evidence.
- Add timeout classification for raw diff dominated logs.
- Keep raw diff available only when path-limited and capped.

## Non-Goals

- Do not remove `git diff --check`.
- Do not prevent developers from inspecting a specific file diff manually.
- Do not rewrite unrelated git closeout behavior.

## Required Behavior

Default git evidence commands:

```powershell
git diff --stat
git diff --name-only
git diff --check
```

Raw diff is allowed only when all are true:

- The command is path-limited.
- Output is capped at 200 lines by `token-safe-git.sh` or an equivalent helper that truncates before model/log emission.
- The caller records why raw patch context is required.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Update worker/runner instructions to prohibit unbounded raw diff dumps. | `agent-loop-phase-runner.mjs` | Prompt snapshot contains bounded diff policy. |
| T2 | Route default diff inspection through safe summary commands. | runner helpers / `token-safe-git.sh` | Closeout logs show stat/name-only/check by default. |
| T3 | Classify raw diff dominated timeout logs. | `agent-loop-phase-runtime.mjs` | `raw_diff_output_timeout` returned for fixture. |
| T4 | Add OBS-2/3 no-regression fixture using synthetic large `diff --git` log. | `agent-loop-phase-runtime.test.mjs`, `agent-loop-phase-runner.test.mjs` | Classifier returns `raw_diff_output_timeout` and retry instructions do not include raw patch body. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-03 | Worker prompt forbids unbounded raw diff. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "diff output budget"` | Policy is present in prompt/continuation text and names stat/name-only/check defaults plus 200-line cap. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-02-qa.md` |
| SCN-04 | OBS-2/3 large raw diff timeout fixture is classified. | `node --test .claude/scripts/agent-loop-phase-runtime.test.mjs --test-name-pattern "raw diff timeout"` | `raw_diff_output_timeout`. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-02-qa.md` |
| SCN-04A | OBS-2/3 retry behavior changes after classification. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "raw diff retry policy"` | Retry instruction uses bounded diff summary and contains no raw `diff --git` body. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-02-qa.md` |

## Validation Plan

```powershell
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/agent-loop-phase-runtime.test.mjs
git diff --check
```

## Blocker Condition

Stop if any normal closeout path still emits an unbounded `git diff` body to logs or model transcript. Convert that path to stat/name-only/check or add a strict path-limited cap.

## Deliverables

- Bounded diff policy in runner prompts.
- Safe git evidence defaults.
- `raw_diff_output_timeout` classifier.

## Phase Completion Checklist

- [ ] Unbounded raw diff is absent from normal worker/runner instructions.
- [ ] Closeout evidence uses bounded git commands.
- [ ] Raw diff timeout fixture is classified and routed away from blind retry.
