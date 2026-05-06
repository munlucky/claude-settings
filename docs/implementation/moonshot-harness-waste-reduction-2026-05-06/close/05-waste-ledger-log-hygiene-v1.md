# Phase 05: Waste Ledger and Log Hygiene (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MWR-013 | WASTE_REGISTER | Repeated warnings summarized | Add warning filter and noise summary |
| MWR-014 | WASTE_REGISTER | Deprecated Codex `--full-auto` removed | Update Codex exec command builders |
| MWR-015 | WASTE_REGISTER | MemoryGraph transport failures summarized once per run | Add run-level availability signal |
| MWR-016 | WASTE_REGISTER | Abnormal retries recorded in waste ledger | Add waste ledger JSONL |

## Goal

- Make abnormal retry cost visible while reducing phase log noise.

## Expected Outcome

- Runs produce `waste-ledger.jsonl` and `noise-summary.json`; repeated plugin/skill/deprecation warnings no longer inflate phase logs.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn: ["03", "04"]
  conflictsWith: ["03", "04", "06"]
  ownedPaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/runtime-cli.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop.mjs"
    - ".claude/verification.contract.yaml"
  readOnlyPaths:
    - ".claude/logs/agent-loop/debug.jsonl"
  sharedMutablePaths:
    - ".claude/verification.contract.yaml"
  requiresManualEvidence: false
  mergePolicy: "sequential_observability_update"
```

## Scope

- In scope:
  - Add waste ledger append helper.
  - Add noise summary for repeated warnings.
  - Replace deprecated `codex exec --full-auto` with supported sandbox flags.
  - Record MemoryGraph transport failure once per run.
- Out of scope:
  - Deleting historical logs.

## Preconditions and Inputs

- Phases 03 and 04 complete.
- `codex exec --help` confirms supported flags: `--sandbox workspace-write`, `--dangerously-bypass-approvals-and-sandbox`, `--ephemeral`.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P05-1 | Add waste ledger helper | Append abnormal retry events with phase, class, action, evidence path | Every non-healthy retry class has one ledger row |
| P05-2 | Add warning filter | Summarize plugin manifest, skill icon, deprecation, MemoryGraph transport warnings | Phase logs keep first occurrence and summary counts |
| P05-3 | Replace deprecated Codex flag | Update command builders in dispatch/runtime CLI | No `--full-auto` warning appears in new run logs |
| P05-4 | Summary integration | Add waste counts to agent loop summary | Summary lists healthy retries vs waste retries |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P05-1 | Abnormal retry classes are counted by type | `bash .claude/scripts/verify-phase-runner-boundary.sh` | `waste-ledger.jsonl` includes path/control/stale classes | `.claude/logs/agent-loop/waste-ledger.jsonl` |
| SCN-P05-2 | Deprecated Codex flag is gone | `rg -- \"--full-auto\" .claude/scripts` | no active command builder uses deprecated flag | `.claude/verification-verdict-phase05-log-hygiene.json` |
| SCN-P05-3 | Log noise is summarized | `bash .claude/scripts/verify-phase-runner-boundary.sh` | `noise-summary.json` contains warning counts | `.claude/logs/agent-loop/noise-summary.json` |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P05-1 | `.claude/logs/agent-loop/waste-ledger.jsonl` at runtime | `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/agent-loop.mjs`, `.claude/scripts/moonshot-phase-dispatch.mjs` | boundary verifier | `bash .claude/scripts/verify-phase-runner-boundary.sh` | GREEN: ledger rows emitted |
| P05-2 | `.claude/logs/agent-loop/noise-summary.json` at runtime | `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/runtime-cli.mjs` | static search and boundary verifier | `rg -- "--full-auto" .claude/scripts` | GREEN: no deprecated active command path |
| P05-3 | none | `.claude/verification.contract.yaml` | contract checks | `bash .claude/scripts/workflow-enforcement.sh verify` | GREEN: observability artifacts accepted |

## Blockers And Review

- Blocker condition: warning filtering hides actionable stderr lines needed for debugging.
- First review checkpoint: after P05-2, inspect filtered log fixture and ensure first occurrence is preserved.
- Re-review trigger: any command builder change affecting sandbox permissions.
- Verification evidence path: `.claude/verification-verdict-phase05-waste-ledger.json`.

## Validation Plan

- [ ] Syntax checks: `node --check .claude/scripts/moonshot-phase-dispatch.mjs && node --check .claude/scripts/runtime-cli.mjs`
- [ ] Behavior checks: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- [ ] Contract checks: `bash .claude/scripts/workflow-enforcement.sh verify`

## Evidence to Mark Done

- Waste ledger sample.
- Noise summary sample.
- Static search showing deprecated command builder removed.

## Deliverables

- Waste ledger, warning filtering, and Codex command update.

## Phase Completion Checklist

- [ ] Waste ledger covers all abnormal retry classes
- [ ] Warning summary preserves actionable first occurrence
- [ ] Deprecated `--full-auto` active command usage removed

## Handoff Notes

- Phase 06 must include ledger/noise artifacts in regression fixtures and docs.
