# Phase 05 - Fixtures, Parity, and Readiness

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "sequential"
  dependsOn: ["04-bounded-phase-closeout-gates-v1.md"]
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/verify-phase-closeout-fixtures.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/verify-phase-runtime-parity.sh"
    - ".claude/scripts/verify-phase-runtime-parity-shell-core.sh"
    - ".claude/scripts/lib/code-review-graph-fixtures/"
  readOnlyPaths:
    - ".claude/docs/runtime-parity-reference-plan"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_fixtures"
```

## Goal
Prove the CRG forced-use contract with pass/fail fixtures before declaring implementation runnable.

## Required Fixtures
- structured CRG evidence pass fixture.
- CRG string-only failure fixture.
- duplicate marker block failure fixture.
- malformed JSON marker failure fixture.
- artifact path traversal failure fixture.
- digest mismatch failure fixture.
- graph empty fixture.
- graph corrupt fixture.
- rebuild failure fixture.
- changedFiles unresolved strict blocker fixture.
- `verify` stage evidence-check-only fixture.
- `finish` stage `persist_summary` fixture.

## Runtime Parity Updates
- Existing parity QA_REPORT/verdict seeds must include structured CRG evidence for strict profiles.
- Add one strict failure path proving legacy `Selected harness components: code-review-graph` is insufficient.
- Add one docs_only warning path proving non-code docs changes are not over-blocked.

## Acceptance Criteria
- `AC-07`: runtime parity and phase closeout fixtures fail without structured CRG evidence.
- `AC-08`: docs-only package creation does not touch active runtime state.
- `AC-14`: artifact path traversal and digest mismatch are blocked.

## Verification
```bash
node --test .claude/scripts/verify-phase-closeout.test.mjs
PHASE_RUNTIME_PARITY_KEEP_TMP=true bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan
```

## Readiness Closeout
- Confirm all phase docs exist.
- Confirm planning-loop artifacts exist.
- Confirm `git status --short` only shows intended docs package until implementation starts.
- Do not run `prepare-implementation-plan-state.mjs` unless a later request explicitly activates this package for phase execution.

