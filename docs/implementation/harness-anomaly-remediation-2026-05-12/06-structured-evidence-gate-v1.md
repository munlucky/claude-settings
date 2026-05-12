# Phase 06: Structured Evidence Gate And Expected Blocker Verdict (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.3 | User plan / Scorecard blocker split | Scorecard blocked reason codes must be structured. | Consume Phase 01 structured blocker metadata before Markdown text. |
| REQ-6.1 | User plan / Evidence gate structure | `SCN-*`, `REQ-*`, blocker status are read from structured artifact metadata first. | Add metadata-first closeout evidence reader. |
| REQ-6.2 | User plan / Expected blocker verdict | `expected_blocker_passed` separates expected exit 1 from real failure. | Add verdict classification and closeout pass handling. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-03 | REQ-1.3 | Structured scorecard metadata can distinguish blocker classes without Markdown parsing. |
| AC-11 | REQ-6.1 | Tests show structured metadata overrides free-form Markdown evidence rows. |
| AC-12 | REQ-6.2 | `expected_blocker_passed` is not counted as closeout failure. |

## Goal
- Make closeout evidence deterministic by treating Markdown rows as human-readable projection, not the source of truth.

## Expected Outcome
- Closeout reads `REQ-*`, `SCN-*`, blocker class, and expected blocker status from structured artifact metadata where available.
- Free-form Markdown remains rendered output but cannot override structured pass/fail metadata.
- Expected failing commands such as required-runtime blocker tests can pass as `expected_blocker_passed`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "01-verifier-environment-parent-reverify-v1"
    - "02-attempt-local-artifact-publish-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.test.mjs"
    - ".claude/scripts/verification-verdict-state.mjs"
    - ".claude/scripts/lib/phase-closeout-artifacts.mjs"
    - ".claude/scripts/lib/phase-closeout-parsers.mjs"
    - ".claude/scripts/lib/phase-closeout-verdict.mjs"
  readOnlyPaths:
    - "docs/implementation/harness-anomaly-remediation-2026-05-12/01-verifier-environment-parent-reverify-v1.md"
    - "docs/implementation/harness-anomaly-remediation-2026-05-12/02-attempt-local-artifact-publish-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Scope
- In scope:
  - Add structured metadata reader for REQ/SCN/blocker status.
  - Prefer metadata over Markdown row parsing.
  - Keep Markdown parser as fallback when metadata is absent.
  - Add `expected_blocker_passed` verdict and closeout pass semantics.
- Out of scope:
  - Removing Markdown evidence rows.
  - Changing plan document `SCN-*` table requirements.
  - Rewriting all historical artifacts.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/harness-anomaly-remediation-2026-05-12/00-master-plan-v1.md`
- Required code/data:
  - Phase 01 blocker fields are available.
  - Phase 02 artifact identity/source attempt fields are available.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P06-1 | Add metadata-first evidence reader | 1) Define normalized metadata shape for requirements, scenarios, blockers. 2) Read metadata from JSON artifacts/verdict payloads. 3) Fall back to Markdown rows only when metadata is missing. | Tests show Markdown contradiction cannot override structured metadata. |
| P06-2 | Update artifact projection | 1) Emit structured evidence metadata alongside QA/SCORECARD human rows. 2) Include source requirement IDs and scenario IDs. 3) Include blocker class/reason code from Phase 01. | Generated artifacts include metadata and readable rows. |
| P06-3 | Add expected blocker verdict | 1) Add `expected_blocker_passed` verdict handling. 2) Ensure exit 1 expected by contract is pass evidence. 3) Keep unexpected exit 1 as failure. | Closeout pass/fail tests distinguish expected from unexpected blocker. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-06-1 | A human Markdown row cannot falsely turn structured failure into pass or pass into failure. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Metadata-first fixtures pass/fail by JSON metadata, not free-form row text. | `.claude/verification-results-harness-anomaly-phase06.log` |
| SCN-06-2 | Required runtime expected blocker is recorded as successful evidence. | `node --test .claude/scripts/verify-phase-closeout.test.mjs .claude/scripts/agent-loop-phase-artifacts.test.mjs` | `expected_blocker_passed` is allowed by closeout. | `.claude/verification-results-harness-anomaly-phase06.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P06-1 | none | `.claude/scripts/verify-phase-closeout.mjs`, `.claude/scripts/lib/phase-closeout-parsers.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Before: free-form row over-sensitive. After: metadata truth source. |
| P06-2 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs`, `.claude/scripts/lib/phase-closeout-artifacts.mjs` | `.claude/scripts/agent-loop-phase-artifacts.test.mjs` | `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs` | Before: row-only output. After: metadata plus row output. |
| P06-3 | none | `.claude/scripts/verification-verdict-state.mjs`, `.claude/scripts/lib/phase-closeout-verdict.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Before: expected exit 1 may fail closeout. After: `expected_blocker_passed` allowed. |

## Blockers And Review
- Blocker condition: existing artifact schema has no durable place for structured evidence metadata.
- First review checkpoint: metadata schema is minimal and versioned before projection changes.
- Re-review trigger: any attempt to delete Markdown evidence rows or relax required `SCN-*` coverage.
- Verification evidence path: `.claude/verification-results-harness-anomaly-phase06.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] Unit: `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs`
- [ ] Integration: `node --test .claude/scripts/*.test.mjs`
- [ ] Integration: `node --test .claude/scripts/lib/*.test.mjs`

## Evidence to Mark Done
- Metadata-first closeout fixture log.
- `expected_blocker_passed` fixture log.
- Changed file list limited to owned paths.

## Deliverables
- Structured closeout evidence metadata contract.
- Expected blocker verdict semantics and tests.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 07 should use the metadata-first gate to require Harness Change Ledger before commit closeout.
