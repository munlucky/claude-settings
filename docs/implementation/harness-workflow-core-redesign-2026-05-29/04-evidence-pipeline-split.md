# Phase 04 - Evidence Pipeline Split

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: workflow-core
  dependsOn:
    - "01-readiness-closeout"
    - "02-control-plane-registry"
  conflictsWith:
    - "03-state-authority-refactor"
    - "05-skill-surface-decomposition"
    - "06-runtime-capability-taxonomy"
  ownedPaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-04/**"
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/phase-04/**"
  stagedOwnedPaths:
    - ".claude/scripts/evidence-router.mjs"
    - ".claude/scripts/evidence-router.test.mjs"
    - ".claude/scripts/verification-*.mjs"
    - ".claude/scripts/*verifier*.mjs"
    - ".claude/scripts/fixtures/evidence-router/**"
  adoptionTargets:
    - ".claude/scripts/evidence-router.mjs"
    - ".claude/scripts/evidence-router.test.mjs"
    - ".claude/scripts/verification-*.mjs"
    - ".claude/scripts/*verifier*.mjs"
    - ".claude/scripts/fixtures/evidence-router/**"
    - ".claude/verification.contract.yaml"
  readOnlyPaths:
    - ".claude/verification.contract.yaml"
    - "docs/implementation/**"
    - ".claude/skills/**/SKILL.md"
  sharedMutablePaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-04/**"
  requiresManualEvidence: false
  mergePolicy: sequential_shared_contract
  liveMutationPolicy:
    liveClaudeWrites: prohibited
    stagingRoot: "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-04"
    adoptionPhase: "08-controlled-harness-adoption"
```

## Objective

Split evidence handling into explicit classes so adapter smoke, workflow contract verification, product acceptance, runtime capability, host environment, and closeout scope are not treated as interchangeable proof.

This phase produces a staged overlay only. The `.claude/**` paths above are intended adoption targets, not permission to mutate the live harness during Phase 04.

## AC Mapping

| AC ID | Source | Expected Evidence | Expected Pass Signal |
|---|---|---|---|
| AC-005 | RC3 | Evidence class schema and command metadata | Verifier command output declares evidence class |
| AC-006 | RC3 | Adapter smoke and product closeout fixtures | Adapter smoke can pass without scorecard; product closeout fails when AC/SCN evidence is missing |

## Overlay Execution

All task commands in this phase run with:

```text
HARNESS_OVERLAY_ROOT=docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-04
```

Resolve staged `.claude/scripts/**` and `.claude/verification.contract.yaml` from `HARNESS_OVERLAY_ROOT` first. Pass `--overlay-root $HARNESS_OVERLAY_ROOT` to router/verifier commands and fixtures.

## Tasks

| Task | Files / Modules | Commands | Fail Signal | Pass Signal | Evidence Path | Review Checkpoint |
|---|---|---|---|---|---|---|
| T01 | Staged evidence router schema | `node --check $HARNESS_OVERLAY_ROOT/.claude/scripts/evidence-router.mjs`; `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/evidence-router.test.mjs` | Unknown class accepted silently or required class omitted | Known classes validate and unknown classes fail with typed error | `execution/phase-04/router-test.txt` | Schema must be small and explicit |
| T02 | Staged verifier command metadata | Targeted verifier test with `--overlay-root $HARNESS_OVERLAY_ROOT` | Command output has no `evidenceClass` | Command output declares one of the approved classes | `execution/phase-04/command-metadata.txt` | Do not infer class from command name only |
| T03 | Staged adapter smoke split | Adapter smoke command or fixture with `--overlay-root $HARNESS_OVERLAY_ROOT` | Adapter smoke fails because scorecard is disabled | Adapter smoke passes with scorecard disabled | `execution/phase-04/adapter-smoke.txt` | Smoke proves route only, not product completion |
| T04 | Staged product closeout guard | Closeout/verifier fixture with `--overlay-root $HARNESS_OVERLAY_ROOT` | Product closeout passes with missing `SCN-*` runtime evidence | Product closeout fails with `product_acceptance_missing` | `execution/phase-04/product-closeout.txt` | Product AC/SCN evidence remains strict |
| T05 | Staged fixture precondition typing | Fixture seed test with `--overlay-root $HARNESS_OVERLAY_ROOT` | Missing seed reported as generic verifier failure | Missing seed reported as `fixture_precondition_missing` | `execution/phase-04/fixture-precondition.txt` | Precondition errors must not look like product failures |

## Blockers

- Existing verifier output shape cannot be extended without breaking consumers.
- Adapter smoke and product closeout share an inseparable command path.
- Missing fixture seeds cannot be detected before verifier execution.
- Any required check cannot run against the staged overlay or dry-run mode without mutating live `.claude`.

## Completion Criteria

- Evidence classes validate through tests.
- At least one adapter smoke path is independent from closeout scorecard.
- Product closeout remains strict for missing AC/SCN evidence.
- Missing fixture seed is typed as a precondition failure.
- Staged overlay manifest lists every proposed `.claude` target and its adoption owner.
