# Phase 03: Runtime Parity Routing

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
    - ".claude/scripts/verify-phase-runtime-parity.mjs"
    - ".claude/scripts/verify-phase-runtime-parity-shell-core.sh"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/lib/phase-closeout-verdict.mjs"
    - ".claude/scripts/lib/phase-closeout-verdict.test.mjs"
    - ".claude/scripts/lib/runtime-unavailable-cache.mjs"
  readOnlyPaths:
    - ".claude/docs/runtime-parity-reference-plan"
    - ".claude/verification.contract.yaml"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- OBS-4, OBS-5, OBS-6: `phaseRuntimeParity` repeatedly timed out in short-budget phase loops.
- REQ-3, REQ-5, AC-4, AC-5.

## Goal

Keep runtime parity verification available, but stop running it as a repeated short-budget per-phase verifier.

## Scope

- Separate runtime parity into `optional_probe` and `required_runtime` profiles.
- Use `optional_probe` in normal phase loops.
- Route `required_runtime` to explicit final/long-budget verification.
- Suppress same-run retry for identical parity timeout keys.

## Non-Goals

- Do not remove runtime parity from final/release verification.
- Do not lower the semantic meaning of a strict parity failure.
- Do not require Codex Desktop restart as normal remediation.

## Required Behavior

Normal phase loop:

```text
run optional_probe
if unavailable:
  record non-strict runtime dependency warning or blocker based on contract
  do not run required_runtime in the same short-budget loop
```

Final/explicit long-budget path:

```text
run required_runtime with sufficient budget
write pass/fail/blocked structured verdict
cache timeout key for same run
```

Timeout key:

```text
runId + verifierId + referencePlanHash + runtimeTarget
```

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add or harden parity profile selection. | parity scripts | `optional_probe` does not spawn heavyweight phase attempt. |
| T2 | Update runner routing to use optional probe in normal loops. | runner/verdict files | Phase loop avoids required runtime parity. |
| T3 | Add same-run timeout suppression for required parity. | runtime cache / verdict | Same key is not retried. |
| T4 | Write blocked verdict fields for parity timeout. | `phase-closeout-verdict.mjs` | Verdict includes rerun command, budget, and why-not-retried. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-05 | Normal loop chooses optional probe. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | Required parity command absent from short-budget phase loop. | QA_REPORT.md |
| SCN-06 | Required parity timeout is not retried with same key. | focused cache/verdict test | Same-run retry is suppressed. | QA_REPORT.md |
| SCN-07 | Blocked parity verdict explains next route. | `node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs` | `phaseRuntimeParity_timeout` verdict includes rerun command and budget. | QA_REPORT.md |

## Validation Plan

```powershell
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs
node --test .claude/scripts/lib/runtime-unavailable-cache.test.mjs
git diff --check
```

## Blocker Condition

Stop if `required_runtime` must still run inside the normal phase loop to satisfy the active verification contract. Record the contract conflict and require an explicit replan.

## Deliverables

- Runtime parity profile split enforced by runner routing.
- Same-run parity timeout suppression.
- Structured blocked verdict for parity timeout.

## Phase Completion Checklist

- [ ] Normal phase loop uses optional probe only.
- [ ] Required parity uses long-budget/final routing.
- [ ] Same parity timeout key is not retried in the same run.
