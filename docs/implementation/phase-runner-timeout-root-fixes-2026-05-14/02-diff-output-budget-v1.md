# Phase 02: Diff Output Budget

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "timeout-root-fixes"
  dependsOn: []
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
- Output is capped by line count.
- The caller records why raw patch context is required.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Update worker/runner instructions to prohibit unbounded raw diff dumps. | `agent-loop-phase-runner.mjs` | Prompt snapshot contains bounded diff policy. |
| T2 | Route default diff inspection through safe summary commands. | runner helpers / `token-safe-git.sh` | Closeout logs show stat/name-only/check by default. |
| T3 | Classify raw diff dominated timeout logs. | `agent-loop-phase-runtime.mjs` | `raw_diff_output_timeout` returned for fixture. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-03 | Worker prompt forbids unbounded raw diff. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | Policy is present in prompt/continuation text. | QA_REPORT.md |
| SCN-04 | Raw diff timeout fixture is classified. | `node --test .claude/scripts/agent-loop-phase-runtime.test.mjs` | `raw_diff_output_timeout`. | QA_REPORT.md |

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
