# Phase 06: Declared Alternate Verifier Policy (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-6.1 | v4 Verifier policy | Required verifier EPERM plus declared alternate pass can complete with warning. | Add declared alternate contract handling. |
| REQ-6.2 | v4 Verifier policy | Undeclared alternate is supporting evidence only. | Add rejection fixtures and verdict classification. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-11 | REQ-6.1 | Required verifier EPERM plus declared alternate pass yields warning completion. |
| AC-12 | REQ-6.2 | `alternate-verifier-undeclared-rejected` test proves undeclared alternate cannot satisfy completion. |

## Goal
- Prevent fallback verifier evidence from silently replacing required verifier evidence.
- Extend Phase 02 verdict policy without weakening canonical manifest completion requirements.

## Expected Outcome
- Verifier EPERM can close only through a declared alternate path; undeclared evidence is visible but not sufficient.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-6"
  dependsOn:
    - "02"
    - "04"
    - "05"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/verification-contract.mjs"
    - ".claude/scripts/lib/verification-contract.test.mjs"
    - ".claude/scripts/lib/phase-closeout-verdict.mjs"
    - ".claude/scripts/lib/phase-closeout-verdict.test.mjs"
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/lib/failure-classifier.test.mjs"
    - ".claude/scripts/write-verification-verdict.py"
  readOnlyPaths:
    - ".claude/verification.contract.yaml"
    - ".claude/scripts/verify-phase-closeout.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_verdict_policy_extension"
```

## Scope
- In scope:
  - Preflight required verifier availability and classify EPERM.
  - Read declared alternate verifier entries from the verification contract or phase metadata.
  - Allow warning completion only when the required verifier failed with EPERM and the declared alternate passed.
  - Treat undeclared alternate evidence as supporting evidence only.
- Out of scope:
  - Adding broad new verifier commands.
  - Weakening manifest completion gate requirements.

## Preconditions and Inputs
- Phase 02 completion gate is active.
- Phase 04 reconciliation cannot convert warnings into clean success.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P06-1 | Add alternate declaration reader | 1) Read verification contract. 2) Normalize declared alternates. 3) Link to required verifier id. | Declared alternate set is explicit and deterministic. |
| P06-2 | Add EPERM preflight classification | 1) Detect required verifier EPERM. 2) Preserve command and error. 3) Require alternate match. | EPERM path cannot disappear into generic success. |
| P06-3 | Add warning completion policy | 1) Required EPERM + declared alternate pass -> warning completion. 2) Undeclared alternate -> supporting evidence only. | Verdict codes match policy. |
| P06-4 | Add tests | 1) Declared alternate pass. 2) Undeclared alternate pass. 3) Alternate fail. | Only declared alternate pass allows warning completion. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-06-1 | Declared alternate verifier can close with warning after EPERM. | `node --test .claude/scripts/lib/verification-contract.test.mjs` | warning completion fixture passes. | `.claude/scripts/lib/verification-contract.test.mjs` |
| SCN-06-2 | Undeclared alternate cannot satisfy completion. | `node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs` | `alternate-verifier-undeclared-rejected` passes. | `.claude/scripts/lib/phase-closeout-verdict.test.mjs` |
| SCN-06-3 | EPERM detail is preserved in verdict output. | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | verifier EPERM class includes command and detail. | `.claude/scripts/lib/failure-classifier.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P06-1 | `.claude/scripts/lib/phase-closeout-verdict.test.mjs` | `.claude/scripts/lib/verification-contract.mjs`, `.claude/scripts/lib/phase-closeout-verdict.mjs` | contract and verdict tests | `node --test .claude/scripts/lib/verification-contract.test.mjs .claude/scripts/lib/phase-closeout-verdict.test.mjs` | exit 0 |
| P06-2 | none | `.claude/scripts/lib/failure-classifier.mjs`, `.claude/scripts/write-verification-verdict.py` | failure classifier tests | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: existing verification contract has no stable place to declare alternate verifier relationships.
- First review checkpoint: alternate declaration schema before verdict policy changes.
- Re-review trigger: any undeclared alternate marks required verifier as passed.
- Verification evidence path: `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/06-declared-alternate-verifier-policy/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/verification-contract.test.mjs`
- [ ] `node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs`
- [ ] `node --test .claude/scripts/lib/failure-classifier.test.mjs`
- [ ] `python -m py_compile .claude/scripts/write-verification-verdict.py`

## Deliverables
- Declared alternate verifier contract.
- Warning completion verdict policy.
- Undeclared alternate rejection fixtures.

## Phase Completion Checklist
- [ ] Required verifier EPERM detail is preserved.
- [ ] Declared alternate pass can produce warning completion.
- [ ] Undeclared alternate remains supporting evidence only.

## Handoff Notes
- Phase 07 should prove declared and undeclared alternate verifier behavior in E2E fixtures.
