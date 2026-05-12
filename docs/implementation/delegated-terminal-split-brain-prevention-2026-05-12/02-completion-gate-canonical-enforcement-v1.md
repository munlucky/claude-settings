# Phase 02: Completion Gate Canonical Enforcement (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.2 | v4 Attempt manifest contract | Finalizer seal is required for completion. | Patch finalizer to seal manifest. |
| REQ-2.1 | v4 Completion gate | Completed requires manifest intent, child identity, exit patch, finalizer seal, and verifier pass. | Add strict gate validation. |
| REQ-2.2 | v4 Completion gate | Projection-only completion is orphan projection. | Add rejection codes and tests. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-03 | REQ-2.1 | `manifest-intent-without-exit-is-incomplete` test fails completion. |
| AC-04 | REQ-2.2 | `runner-log-without-manifest-rejected` and `phase-status-only-completion-rejected` tests fail completion as `orphan_projection_completion`. |

## Goal
- Make manifest-required completion impossible without canonical attempt and finalizer evidence.

## Expected Outcome
- Direct-pass/projection-only paths cannot mark Phase 2-8 as completed.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn:
    - "01"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/lib/phase-closeout-verdict.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/phase-attempt-manifest.mjs"
    - ".claude/scripts/lib/final-outcome-projection.mjs"
    - ".claude/scripts/lib/harness-state-invariants.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_policy"
```

## Scope
- In scope:
  - Completed gate requires manifest intent, child identity, exit patch, finalizer seal, and verifier contract pass.
  - `incomplete_attempt_manifest` for manifest intent without `runnerFinishedAt`, `runnerExitCode`, or `finalizerTransactionId`.
  - `orphan_projection_completion` for runner-log-only, direct-pass-only, or phase-status-only completion.
  - Finalizer seal fields: `completionTransactionId`, `finalizerTransactionId`, `verificationVerdictPath`, `completionGateVerdict`.
- Out of scope:
  - Manual orphan adoption mechanics.
  - Transaction resume/retry implementation.

## Preconditions and Inputs
- Phase 01 manifest reader/writer is complete.
- Existing sidecar/manifest blocker behavior from `blocker-closeout-prevention-2026-05-12` remains intact.

## Canonical Mode Precedence
```yaml
completionGatePrecedence:
  schemaVersion: 1
  modes:
    attemptManifestRequired:
      trigger:
        - "attempt manifest has manifestRequired: true"
        - "attempt manifest has numeric schemaVersion >= 1"
      requiredEvidence:
        - "manifest intent"
        - "child identity"
        - "exit patch"
        - "finalizer seal"
        - "verifier contract pass or declared warning-completion policy"
      legacyFallbackAllowed: false
    blockerSidecarManifestCanonical:
      trigger:
        - "blocker closeout sidecar/manifest exists for a blocker-closeout package"
        - "attemptManifestRequired is not triggered"
      requiredEvidence:
        - "sidecar canonical state"
        - "blocker closeout verifier state"
      legacyFallbackAllowed: "only as defined by blocker-closeout-prevention package"
    legacyProjectionOnly:
      trigger:
        - "no attempt manifest enforcement"
        - "no blocker sidecar canonical mode"
      completionAllowed: false
      failureCode: "orphan_projection_completion"
```

Failure-code priority when multiple evidence surfaces exist:
1. `incomplete_attempt_manifest` wins when an enforced attempt manifest exists but lacks child identity, exit patch, or finalizer seal.
2. `attempt_manifest_verifier_failed` wins when the enforced manifest is complete but verifier contract does not pass.
3. `orphan_projection_completion` wins when logs, direct-pass artifacts, or phase-status completion exist without enforced canonical manifest evidence.
4. Blocker sidecar failure codes apply only when `attemptManifestRequired` is not triggered.

Rules:
- If attempt manifest required mode is active, blocker sidecar/manifest evidence can be supporting context but cannot replace missing attempt manifest fields.
- If both blocker sidecar canonical mode and attempt manifest required mode are present, the attempt manifest gate is evaluated first.
- Runner log fallback, direct-pass fallback, phase-status fallback, and Markdown projection fallback are forbidden completion inputs under attempt manifest required mode.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Add completion gate evaluator | 1) Read manifest. 2) Validate intent/child/exit/finalizer fields. 3) Read verifier verdict. | Evaluator emits stable pass/fail code and evidence list. |
| P02-2 | Patch finalizer seal | 1) Generate `completionTransactionId`. 2) Write `finalizerTransactionId`. 3) Store verdict path and gate verdict. | Completion writes are sealed in manifest before status promotion. |
| P02-3 | Reject projection-only completion | 1) Apply canonical mode precedence. 2) Detect completion artifacts without enforced manifest. 3) Return `orphan_projection_completion`. 4) Keep artifacts for manual reconcile. | Projection-only states never become completed automatically. |
| P02-4 | Add regression tests | 1) Intent missing exit. 2) Runner log only. 3) Phase status only. 4) Direct-pass only. | All false-completion fixtures fail with expected codes. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | Manifest intent alone cannot complete a phase. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | `incomplete_attempt_manifest` appears. | `.claude/scripts/verify-phase-closeout.test.mjs` |
| SCN-02-2 | Runner log only is rejected. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | `orphan_projection_completion` appears. | `.claude/scripts/verify-phase-closeout.test.mjs` |
| SCN-02-3 | Finalizer completion includes a manifest seal. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | finalizer seal fields are present. | `.claude/scripts/phase-closeout-finalize.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P02-1 | none | `.claude/scripts/verify-phase-closeout.mjs`, `.claude/scripts/lib/phase-closeout-verdict.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | exit 0 |
| P02-2 | none | `.claude/scripts/phase-closeout-finalize.mjs` | `.claude/scripts/phase-closeout-finalize.test.mjs` | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: finalizer cannot atomically update manifest before status promotion.
- First review checkpoint: gate code taxonomy before changing finalizer behavior.
- Re-review trigger: any caller treats `orphan_projection_completion` as completed.
- Verification evidence path: `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/02-completion-gate-canonical-enforcement/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] `node --check .claude/scripts/verify-phase-closeout.mjs`
- [ ] `node --check .claude/scripts/phase-closeout-finalize.mjs`

## Deliverables
- Completion gate evaluator.
- Finalizer manifest seal.
- Projection-only rejection fixtures.

## Phase Completion Checklist
- [ ] Completed gate requires all canonical manifest fields.
- [ ] Projection-only/direct-pass-only completion is rejected.
- [ ] Finalizer seal is written before completion promotion.

## Handoff Notes
- Phase 03 may adopt orphan projection only through explicit manual reconcile mode after this phase's rejection codes exist.
