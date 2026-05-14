# Phase 03: Runtime Parity Routing

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "timeout-root-fixes"
  dependsOn:
    - "01-diagnostic-search-budget-v1.md"
    - "02-diff-output-budget-v1.md"
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
    - ".claude/scripts/lib/runtime-unavailable-cache.test.mjs"
    - ".claude/verification.contract.yaml"
  readOnlyPaths:
    - ".claude/docs/runtime-parity-reference-plan"
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

- Acknowledge the existing `optional_probe|required_runtime` parity support and implement contract/profile routing that selects the correct profile.
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
read .claude/verification.contract.yaml
resolve phaseRuntimeParity profile as optional_probe for normal short-budget phase loop
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

Contract-aware routing requirement:

- The implementation phase owns `.claude/verification.contract.yaml` in the plan because the active contract may need profile metadata or a policy-set adjustment.
- If the implementation can avoid editing the contract, it must add or update a resolver in source code and tests proving that the existing contract is read as input and mapped so normal short-budget loops schedule `optional_probe`, not `required_runtime`.
- The verification fixture must include the current contract shape where `phaseRuntimeParity` is required, and assert the runner still selects `optional_probe` in normal loops.
- `required_runtime` may be selected only when `verificationProfile=required_runtime`, `PHASE_RUNTIME_PARITY_REQUIRED=true`, final/release closeout mode, or an explicit long-budget command is present.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Harden contract-aware parity profile selection around existing `optional_probe|required_runtime` support. | parity scripts / contract resolver | `optional_probe` does not spawn heavyweight phase attempt and is selected from normal loop contract input. |
| T2 | Update runner routing to use optional probe in normal loops. | runner/verdict files | Phase loop avoids required runtime parity even when the contract lists `phaseRuntimeParity` as required. |
| T3 | Add same-run timeout suppression for required parity. | runtime cache / verdict | Same key is not retried. |
| T4 | Write blocked verdict fields for parity timeout. | `phase-closeout-verdict.mjs` | Verdict includes rerun command, budget, and why-not-retried. |
| T5 | Add OBS-4/5/6 no-regression fixture for repeated parity timeout. | `agent-loop-phase-runner.test.mjs`, `runtime-unavailable-cache.test.mjs` | First timeout routes to long budget; repeated same key is not scheduled in short-budget loop. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-05 | Normal loop chooses optional probe from contract input. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "contract parity optional probe"` | `required_runtime` command absent from short-budget phase loop while `.claude/verification.contract.yaml` still lists `phaseRuntimeParity`. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-03-qa.md` |
| SCN-06 | Required parity timeout is not retried with same key. | `node --test .claude/scripts/lib/runtime-unavailable-cache.test.mjs --test-name-pattern "phase runtime parity same run timeout"` | Same-run retry is suppressed for `runId + verifierId + referencePlanHash + runtimeTarget`. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-03-qa.md` |
| SCN-07 | Blocked parity verdict explains next route. | `node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs --test-name-pattern "parity timeout blocked verdict"` | `phaseRuntimeParity_timeout` verdict includes rerun command, required budget, and why-not-retried. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-03-qa.md` |
| SCN-07A | OBS-4/5/6 no-regression: repeated parity timeouts change scheduling. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "parity timeout no retry"` | First timeout emits blocked long-budget route; repeated same key is not scheduled again in short-budget loop. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-03-qa.md` |

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
