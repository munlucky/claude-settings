# Phase 02: Structured Plan Conformance Artifact (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-2.1 | Structured Evidence Contract | Emit `execution/<phase-slug>/plan-conformance-result.json` with required fields. | Add or update conformance writer and verifier consumption. |
| REQ-2.2 | Source hash freshness | Artifact path or `sourceHash` mismatch makes completion stale. | Hash active phase doc, sprint contract, QA report, scorecard, handoff. |
| REQ-1.3 | Verifier strict completed metadata | Completion requires conformance pass. | Wire artifact freshness into closeout verification. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-04 | REQ-2.1 | JSON artifact contains `schemaVersion`, identity fields, `verdict`, `checkedAt`, `sourceHash`, and `violations[]`. |
| AC-05 | REQ-2.2 | Path mismatch or hash mismatch fails completion as stale conformance evidence. |
| AC-03 | REQ-1.3 | Completed phase without fresh conformance pass fails verifier. |

## Goal
- Make plan conformance a structured, identity-bound artifact rather than an implicit command side effect.

## Expected Outcome
- Every closeable phase has a deterministic `plan-conformance-result.json`.
- `verify-phase-closeout.mjs` rejects completed phases when the artifact is missing, stale, mismatched, or failed.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn:
    - "01-completion-owner-zero-attempt-guard-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/verify-plan-conformance.mjs"
    - ".claude/scripts/verify-plan-conformance.test.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/lib/phase-closeout-artifacts.mjs"
    - ".claude/scripts/lib/phase-closeout-artifacts.test.mjs"
    - ".claude/templates/execution/SPRINT_CONTRACT.template.md"
    - ".claude/templates/execution/QA_REPORT.template.md"
    - ".claude/templates/execution/SCORECARD.template.md"
    - ".claude/templates/execution/HANDOFF.template.md"
  readOnlyPaths:
    - "docs/implementation/residual-harness-anomaly-v4-2026-05-12/01-completion-owner-zero-attempt-guard-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- In scope:
  - Define conformance artifact schema.
  - Compute `sourceHash` from active phase doc plus execution artifacts.
  - Write artifact into the current phase execution directory.
  - Require fresh artifact in closeout verification.
- Out of scope:
  - Rewriting all historical conformance outputs.
  - Changing source plan conformance semantics unrelated to freshness.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/residual-harness-anomaly-v4-2026-05-12/00-master-plan-v1.md`
- Required code/data:
  - Existing `verify-plan-conformance.mjs` CLI.
  - Execution artifact paths for `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `SCORECARD.md`, `HANDOFF.md`.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Define artifact schema | 1) Add schema fixture. 2) Include required fields. 3) Keep `violations[]` structured. | Fixture validates required fields. |
| P02-2 | Add source hash | 1) Hash active phase doc. 2) Hash sprint contract, QA, scorecard, handoff when present. 3) Record missing required artifacts as violations, not empty hash success. | Hash changes when any source changes. |
| P02-3 | Write artifact path | 1) Resolve `execution/<phase-slug>/plan-conformance-result.json`. 2) Avoid root-level ambiguous writes. 3) Include `checkedAt` and identity fields. | Artifact lands in phase execution directory. |
| P02-4 | Enforce freshness in closeout | 1) Read artifact from current phase execution path. 2) Recompute hash. 3) Fail mismatch/path mismatch/verdict fail. | Verifier rejects stale conformance artifact. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | Completion cannot use a conformance result from another phase path. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Path mismatch fixture fails. | `.claude/verification-results-residual-harness-v4-phase02.log` |
| SCN-02-2 | Completion cannot use a stale conformance result after source artifacts change. | `node --test .claude/scripts/verify-plan-conformance.test.mjs .claude/scripts/verify-phase-closeout.test.mjs` | `sourceHash` mismatch fixture fails. | `.claude/verification-results-residual-harness-v4-phase02.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P02-1 | optional `.claude/scripts/lib/plan-conformance-artifact.mjs` | `.claude/scripts/verify-plan-conformance.mjs` | `.claude/scripts/verify-plan-conformance.test.mjs` | `node --test .claude/scripts/verify-plan-conformance.test.mjs` | Artifact schema fields present. |
| P02-2 | none | `.claude/scripts/verify-plan-conformance.mjs` | `.claude/scripts/verify-plan-conformance.test.mjs` | `node --test .claude/scripts/verify-plan-conformance.test.mjs` | Hash mismatch test fails as stale. |
| P02-3 | none | `.claude/scripts/verify-plan-conformance.mjs`, execution templates if needed | `.claude/scripts/verify-plan-conformance.test.mjs` | `node .claude/scripts/verify-plan-conformance.mjs --json` | JSON output names artifact path. |
| P02-4 | none | `.claude/scripts/verify-phase-closeout.mjs`, `.claude/scripts/lib/phase-closeout-artifacts.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Completed phase requires fresh conformance pass. |

## Blockers And Review
- Blocker condition: execution root or phase slug cannot be resolved deterministically.
- First review checkpoint: artifact schema before closeout verifier integration.
- Re-review trigger: any fallback that accepts timestamp-only freshness.
- Verification evidence path: `.claude/verification-results-residual-harness-v4-phase02.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/verify-plan-conformance.test.mjs`
- [ ] Unit: `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] Integration: `node --test .claude/scripts/lib/*.test.mjs`
- [ ] Integration: `node --test .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Conformance artifact fixture.
- Stale path/hash failure logs.
- Fresh pass fixture log.

## Deliverables
- Structured conformance artifact writer/reader.
- Closeout verifier freshness enforcement.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 03 must include conformance artifact identity in the fresh verdict check.

