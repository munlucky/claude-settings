# Phase 03: Spawn Prompt Redaction And Log Hygiene (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HWO-008 | User overhead item 8 | Full worker prompts must not be duplicated in every `SUPERVISOR_EVENT spawn` log | Add prompt archive/hash redaction |
| HWO-007 | User overhead item 7 | startup warnings should be summarized instead of repeated in logs | Preserve warning evidence while reducing duplicated payloads |
| HWO-011 | Prior MWR-013/MWR-015 | Repeated warnings and MemoryGraph noise require log hygiene | Add bounded log event shape |

## Goal

- Separate operational trace from full prompt archive so logs stay searchable and bounded.

## Expected Outcome

- `SUPERVISOR_EVENT spawn` no longer includes the full prompt argument.
- Spawn events include command name, redacted argv summary, prompt hash, prompt byte count, and prompt archive path.
- Prompt archives are stored once per hash under `.claude/logs/agent-loop/prompts/`.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-3"
  dependsOn:
    - "02"
  conflictsWith:
    - "05"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runtime.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/lib/awtl-harness-capture.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-plan-lib.mjs"
    - ".claude/logs/agent-loop/"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope

- In scope:
  - Add helper to detect prompt-bearing argv and archive prompt text by stable hash.
  - Redact `SUPERVISOR_EVENT spawn` payloads in both watchdog and completion-gate runners.
  - Keep enough command metadata to debug runtime selection and command construction.
  - Preserve full prompt in ignored log prompt archive, not in phase log lines.
- Out of scope:
  - Changing the content of worker prompts.
  - Removing raw stdout/stderr from worker execution logs.
  - Changing AWTL event schema unless existing event tests require explicit metadata additions.

## Preconditions And Inputs

- Phase 02 classifier changes are merged so log summaries preserve stable failure codes.
- Required current code:
  - `.claude/scripts/agent-loop-phase-runtime.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P03-1 | Add command redaction helper | Implement command summary with `commandName`, `argvHash`, `promptHash`, `promptBytes`, `promptArchivePath` | Spawn event omits raw prompt |
| P03-2 | Archive prompt once per hash | Write prompt files under `.claude/logs/agent-loop/prompts/` and reuse existing file for same hash | Repeated same prompt does not duplicate archive |
| P03-3 | Apply to runtime spawn events | Use helper in `run-with-watchdog` and `run-worker-prompt-with-completion-gate` | Both event modes are redacted |
| P03-4 | Preserve debuggability | Include runtime command name and non-prompt args needed for troubleshooting | Operator can see runtime and cwd without reading prompt |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P03-1 | Phase log no longer stores full worker prompt in spawn event | targeted node fixture or runtime self-test | `SUPERVISOR_EVENT spawn` contains `promptHash` and not the prompt body | `QA_REPORT.md` fixture output |
| SCN-P03-2 | Prompt remains recoverable when needed | targeted node fixture or manual smoke with temp log | `promptArchivePath` exists and hash matches prompt content | `QA_REPORT.md` fixture output |
| SCN-P03-3 | Non-prompt command metadata stays useful | targeted node fixture | event includes command name and argv hash | `QA_REPORT.md` fixture output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P03-1 | optional helper test fixture | `.claude/scripts/agent-loop-phase-runtime.mjs` | runtime fixture/self-test if added | `node --check .claude/scripts/agent-loop-phase-runtime.mjs` | Exit 0 |
| P03-2 | `.claude/logs/agent-loop/prompts/<hash>.txt` at runtime only | `.claude/scripts/agent-loop-phase-runtime.mjs` | temp prompt fixture | targeted fixture command | Archive file exists; event stores path/hash |
| P03-3 | none | `.claude/scripts/agent-loop-phase-runtime.mjs` | same | fixture covering both modes | Both spawn modes redacted |
| P03-4 | none | `.claude/scripts/moonshot-phase-dispatch.mjs` if dispatch launch logging needs matching summary | existing checks | `node --check .claude/scripts/moonshot-phase-dispatch.mjs` | Exit 0 |

## Blockers And Review

- Blocker condition: Prompt archive is not written but spawn event omits the only copy of the prompt.
- First review checkpoint: Review redacted event shape before replacing all spawn command logging.
- Re-review trigger: Any change to Codex Windows prompt-file behavior or command construction.
- Verification evidence path: `docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/03-phase-03-spawn-prompt-redaction-log-hygiene-v1/QA_REPORT.md`

## Validation Plan

- [ ] `node --check .claude/scripts/agent-loop-phase-runtime.mjs`
- [ ] `node --check .claude/scripts/moonshot-phase-dispatch.mjs`
- [ ] Targeted fixture verifies redacted event and prompt archive.
- [ ] Existing AWTL capture tests still pass if touched: `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs`

## Evidence To Mark Done

- Spawn event fixture showing no full prompt.
- Prompt archive path/hash evidence.
- Log-size comparison note for a representative prompt payload.

## Deliverables

- Redacted spawn event shape.
- Prompt archive/hash mechanism.
- Regression coverage for no full prompt in `SUPERVISOR_EVENT`.

## Phase Completion Checklist

- [ ] Spawn events omit full prompt.
- [ ] Prompt archive exists and is hash-addressed.
- [ ] Debug metadata remains sufficient.
- [ ] Relevant syntax/tests pass.

## Handoff Notes

- Phase 05 may rely on smaller logs when classifying gate and retry outcomes.
