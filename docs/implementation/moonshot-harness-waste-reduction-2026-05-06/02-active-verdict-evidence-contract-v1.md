# Phase 02: Active Verdict and Evidence Contract (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MWR-003 | WASTE_REGISTER | Stale/superseded verdicts cannot block clean completion | Centralize active verdict filtering |
| MWR-004 | WASTE_REGISTER | Non-runtime verdicts classified separately | Add verdict blocker classes |
| MWR-005 | WASTE_REGISTER | Missing verification evidence stops as contract failure | Stop instead of spawning micro-retries |

## Goal

- Make completion gates consume only active, phase-relevant, run-relevant verification verdicts.

## Expected Outcome

- A stale failed verdict cannot override a newer successful phase verdict, and missing evidence produces one explicit stop reason.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn: ["01"]
  conflictsWith: ["04"]
  ownedPaths:
    - ".claude/scripts/verification-verdict-state.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/write-verification-verdict.py"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/verify-phase-runtime-parity.sh"
  readOnlyPaths:
    - ".claude/verification.contract.yaml"
    - "docs/implementation/moonshot-harness-waste-reduction-2026-05-06/01-path-authority-fail-fast-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch_after_phase01"
```

## Scope

- In scope:
  - Normalize verdict metadata: `phaseNumber`, `runLeaseId`, `qaReportPath`, `sourcePlanPath`, `supersedes`.
  - Reuse one active verdict helper in runner/state logic.
  - Treat missing evidence as `verification_contract_failure`.
- Out of scope:
  - Closeout markdown field synchronization.

## Preconditions and Inputs

- Phase 01 complete.
- Existing files:
  - `.claude/scripts/verification-verdict-state.mjs`
  - `.claude/scripts/agent-loop-phase-state.mjs`
  - `.claude/scripts/write-verification-verdict.py`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P02-1 | Extend verdict schema | Add metadata args and payload fields in `write-verification-verdict.py` | Generated verdicts include phase/run/path metadata |
| P02-2 | Centralize active verdict helper | Make stale/superseded/imported/phase-mismatched verdict filtering one reusable function | Runner and phase state use identical relevance rules |
| P02-3 | Split blocker classes | Classify `verification_failed`, `content_precondition`, `verifier_unavailable`, and `missing_evidence` separately | Debug events show exact blocker class |
| P02-4 | Stop missing evidence loops | Replace micro-retry path with one explicit stop when verdict path is missing | `missing-verification-evidence` does not spawn repeated workers |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P02-1 | New success verdict wins over stale failed verdict | `node .claude/scripts/verification-verdict-state.mjs self-test` | stale/superseded verdict reports inactive | `.claude/verification-verdict-phase02-verdict-state.json` |
| SCN-P02-2 | Missing evidence produces one contract stop | `bash .claude/scripts/verify-phase-runner-boundary.sh` | no repeated `phase-stop missing-verification-evidence` loop | `.claude/logs/agent-loop/waste-ledger.jsonl` |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P02-1 | none | `.claude/scripts/write-verification-verdict.py` | generated verdict fixture | `python3 .claude/scripts/write-verification-verdict.py --output /tmp/mwr-verdict.json --run-id mwr-p02 --phase-number 2` | GREEN: payload includes metadata fields |
| P02-2 | none | `.claude/scripts/verification-verdict-state.mjs`, `.claude/scripts/agent-loop-phase-state.mjs`, `.claude/scripts/agent-loop-phase-runner.mjs` | self-tests and boundary tests | `node .claude/scripts/verification-verdict-state.mjs self-test` | RED: stale blocker active; GREEN: stale blocker inactive |

## Blockers And Review

- Blocker condition: existing consumers require legacy verdicts without metadata and no compatibility path is defined.
- First review checkpoint: after P02-2, verify no duplicate stale filtering logic remains in modified files.
- Re-review trigger: any change to completion gate allowed/blocked semantics.
- Verification evidence path: `.claude/verification-verdict-phase02-verdict-contract.json`.

## Validation Plan

- [ ] Syntax checks: `node --check .claude/scripts/verification-verdict-state.mjs && node --check .claude/scripts/agent-loop-phase-state.mjs`
- [ ] Behavior checks: `node .claude/scripts/verification-verdict-state.mjs self-test`
- [ ] Runtime parity: `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`

## Evidence to Mark Done

- Generated verdict fixture with metadata.
- Self-test output for stale/superseded verdicts.
- Boundary evidence showing no repeated missing-evidence worker storm.

## Deliverables

- Active verdict helper and evidence contract.

## Phase Completion Checklist

- [ ] Active verdict helper is shared by runner and state
- [ ] Missing evidence has one stop path
- [ ] Legacy verdicts are either compatible or explicitly rejected with clear reason

## Handoff Notes

- Phase 04 must use the active verdict helper when building closeout sync.

