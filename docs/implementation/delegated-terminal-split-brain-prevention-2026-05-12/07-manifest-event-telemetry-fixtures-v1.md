# Phase 07: Manifest Event Telemetry Fixtures (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-7.1 | v4 Manifest event telemetry | Timing/cache telemetry is based on manifest events. | Add telemetry reader and final fixtures. |
| REQ-7.2 | v4 Legacy cutoff | `legacy-grandfathered-by-cutoff` must be explicit and bounded. | Add cutoff fixture and rejection fixture. |
| REQ-1.1..6.2 | v4 Full test plan | Test all manifest, gate, adoption, reconciliation, liveness, and verifier policies. | Add end-to-end regression coverage. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-13 | REQ-7.1 | Telemetry tests derive timing/cache metrics from manifest events. |
| AC-14 | REQ-7.2 | `legacy-grandfathered-by-cutoff` passes only for pre-enforcement artifacts with no `schemaVersion` and no `manifestRequired`; projection-only artifacts after enforcement are rejected as `orphan_projection_completion`. |
| AC-01..AC-12 | REQ-1.1..6.2 | E2E regression command covers all named v4 test cases. |

## Goal
- Prove the whole defect class is closed and telemetry is derived from canonical manifest events.

## Expected Outcome
- The runner cannot repeat Phase 2-8 direct-pass/projection completion without failing tests.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-7"
  dependsOn:
    - "01"
    - "02"
    - "03"
    - "04"
    - "05"
    - "06"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/fixtures/delegated-terminal-split-brain-prevention/**"
    - ".claude/scripts/delegated-terminal-split-brain-prevention.e2e.test.mjs"
    - ".claude/scripts/lib/phase-attempt-telemetry.mjs"
    - ".claude/scripts/lib/phase-attempt-telemetry.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/**/*.mjs"
    - ".claude/scripts/**/*.test.mjs"
    - "docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/**"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "final_regression_slice"
```

## Scope
- In scope:
  - Telemetry reader for manifest/heartbeat events.
  - Regression fixtures for all v4 test plan rows:
    - `manifest-created-before-spawn`
    - `manifest-intent-without-exit-is-incomplete`
    - `runner-log-without-manifest-rejected`
    - `phase-status-only-completion-rejected`
    - `delegated-loop-cannot-adopt-orphan`
    - `partial-reconciliation-not-success`
    - `pid-reuse-not-worker-active`
    - `child-start-time-missing-is-unknown`
    - `alternate-verifier-undeclared-rejected`
    - `legacy-grandfathered-by-cutoff`
  - Broad targeted test command list for completion evidence.
- Out of scope:
  - New production behavior outside regression/telemetry support.

## Preconditions and Inputs
- Phases 01-06 are complete.

## Legacy Cutoff Contract
```yaml
legacyGrandfatherCutoff:
  acId: "AC-14"
  allowedGrandfatheredInput:
    schemaVersion: "absent"
    manifestRequired: "absent"
    artifactClass:
      - "pre-enforcement phase-status completion"
      - "pre-enforcement runner log"
      - "pre-enforcement direct-pass artifact"
    cutoffBasis: "artifact created before manifest enforcement is introduced for the package under test"
    requiredFixtureSignal:
      - "no attempt-manifest.json exists"
      - "no manifestRequired flag exists in any completion metadata"
      - "no numeric schemaVersion >= 1 exists in any completion metadata"
  rejectedAsOrphanProjection:
    - "any artifact with manifestRequired: true but missing canonical manifest fields"
    - "any artifact with numeric schemaVersion >= 1 but missing canonical manifest fields"
    - "any post-enforcement phase-status-only completion"
    - "any post-enforcement runner-log-only completion"
    - "any post-enforcement direct-pass-only completion"
  expectedCodes:
    grandfathered: "legacy_grandfathered_by_cutoff"
    rejected: "orphan_projection_completion"
```

Rules:
- The cutoff is not a date-only escape hatch. It is defined by absence of both `schemaVersion` and `manifestRequired` plus matching a known pre-enforcement legacy artifact class.
- If `schemaVersion >= 1` or `manifestRequired: true` appears anywhere in the candidate completion evidence, legacy grandfathering is forbidden.
- Grandfathered legacy evidence can explain historical state; it cannot be used as canonical completion input for new manifest-required attempts.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P07-1 | Add telemetry module | 1) Read manifest events. 2) Compute runner timings. 3) Compute cache hit/miss signals from event fields. | Telemetry does not rely on projection mtime alone. |
| P07-2 | Add E2E fixture set | 1) Build deterministic fixture root. 2) Include canonical, incomplete, orphan, manual adoption, PID reuse, alternate verifier, pre-enforcement legacy cutoff, and post-enforcement orphan projection states. | Fixtures do not read live runtime state. |
| P07-3 | Add E2E test | 1) Execute all named v4 scenarios. 2) Assert stable reason codes. 3) Assert legacy cutoff remains grandfathered only under AC-14. 4) Assert post-enforcement projection-only artifacts are rejected. | One test file proves full contract. |
| P07-4 | Run broad validation | 1) Run new E2E. 2) Run touched unit tests. 3) Run `git diff --check`. | QA evidence can cite exact commands and pass signals. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-07-1 | Direct-pass/projection-only completion fails. | `node --test .claude/scripts/delegated-terminal-split-brain-prevention.e2e.test.mjs` | `orphan_projection_completion` scenarios pass. | `.claude/scripts/delegated-terminal-split-brain-prevention.e2e.test.mjs` |
| SCN-07-2 | Legacy artifacts before cutoff remain grandfathered. | `node --test .claude/scripts/delegated-terminal-split-brain-prevention.e2e.test.mjs` | `legacy-grandfathered-by-cutoff` passes. | `.claude/scripts/delegated-terminal-split-brain-prevention.e2e.test.mjs` |
| SCN-07-3 | Telemetry comes from manifest events. | `node --test .claude/scripts/lib/phase-attempt-telemetry.test.mjs` | manifest event timing/cache cases pass. | `.claude/scripts/lib/phase-attempt-telemetry.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P07-1 | `.claude/scripts/lib/phase-attempt-telemetry.mjs`, `.claude/scripts/lib/phase-attempt-telemetry.test.mjs` | none | telemetry test | `node --test .claude/scripts/lib/phase-attempt-telemetry.test.mjs` | exit 0 |
| P07-2 | `.claude/scripts/fixtures/delegated-terminal-split-brain-prevention/**`, `.claude/scripts/delegated-terminal-split-brain-prevention.e2e.test.mjs` | none | E2E test | `node --test .claude/scripts/delegated-terminal-split-brain-prevention.e2e.test.mjs` | exit 0 |
| P07-3 | none | none | touched regression set | `node --test .claude/scripts/lib/phase-attempt-manifest.test.mjs .claude/scripts/verify-phase-closeout.test.mjs .claude/scripts/phase-closeout-reconciler.test.mjs .claude/scripts/agent-loop-phase-state.test.mjs .claude/scripts/lib/phase-liveness-checker.test.mjs .claude/scripts/lib/verification-contract.test.mjs .claude/scripts/delegated-terminal-split-brain-prevention.e2e.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: E2E fixture must read live `.claude/docs/phase-status.yaml` or active runtime logs.
- First review checkpoint: fixture inventory before broad validation is added to QA evidence.
- Re-review trigger: any fixture passes without checking manifest/finalizer identity fields.
- Verification evidence path: `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/07-manifest-event-telemetry-fixtures/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/phase-attempt-telemetry.test.mjs`
- [ ] `node --test .claude/scripts/delegated-terminal-split-brain-prevention.e2e.test.mjs`
- [ ] Touched regression set listed above.
- [ ] `git diff --check`

## Deliverables
- Manifest event telemetry module.
- E2E fixture set for v4 named tests.
- QA evidence command list for implementation closeout.

## Phase Completion Checklist
- [ ] Telemetry is manifest-event based.
- [ ] All v4 named test cases are covered.
- [ ] Legacy cutoff behavior is explicit.
- [ ] Fixtures do not depend on active runtime state.

## Handoff Notes
- After Phase 07 passes, update this master checklist and only then consider runtime pointer preparation with explicit user instruction.
