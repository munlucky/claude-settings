# Phase 01 - Auto Bootstrap Lifecycle Command v1

Status: planned

## Execution Metadata

```yaml
phaseMetadata:
  phaseId: "01"
  title: "Auto Bootstrap Lifecycle Command"
  status: planned
  dependsOn: []
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - tools/harness-lab/harness-loop.mjs
    - tests/harness-lab-contract.test.mjs
    - package.json
    - docs/public/guidelines/harness-bootstrap-lab.md
    - docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/**
  readOnlyPaths:
    - tools/harness-lab/harness-lab.mjs
    - package/package-contract.yaml
    - schemas/verification.contract.yaml
    - .moonshot-relay/harness-lab/baselines/current.json
  writeSetBoundary:
    allowed:
      - tools/harness-lab/**
      - tests/**
      - package.json
      - docs/**
      - .moonshot-relay/harness-lab/** as generated evidence only
    forbidden:
      - live account-root profiles
      - Docker registry publish
      - package runtime payload adoption
      - git commit or push
  requiredEvidenceSlots:
    - auto_init_no_baseline_result
    - candidate_only_existing_baseline_result
    - status_pointer_after_auto_init
    - command_contract_tests
    - selected_command_scripts
```

## Objective

Make the normal operator entrypoint match the lifecycle model:

```text
if no baseline:
  initialize baseline from baselineRef
  run baseline Docker benchmark
  run candidate Docker benchmark
  compare and record decision
else:
  run candidate Docker benchmark only
  compare against stored baseline artifact
```

## Required Behavior

- Add the selected command surface `npm run lab:auto`.
- Add `npm run lab:auto:promote` for explicit promotion after a passing compare.
- The command must inspect `baselines/current.json` before deciding the path.
- No-baseline path must reuse `initLoop` behavior, including baseline and candidate Docker runs.
- Existing-baseline path must reuse `candidateLoop`, not rerun baseline unless calibration policy requests it.
- Existing-baseline path must not rerun baseline automatically. If calibration is required, `lab:auto` returns `status: calibration_required` and exits non-zero unless the operator runs `npm run lab:calibrate`.
- The summary artifact must name which path was selected: `initial_bootstrap` or `candidate_only`.
- The command must not promote by default unless an explicit promote flag or later phase policy enables it.
- No-baseline bootstrap uses `--baseline-ref HEAD` by default to match current `lab:init`; operators may override it with `--baseline-ref <git-ref>`. The selected baseline ref must be recorded in the lifecycle summary.

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P01-AC1 | Missing baseline selects initial bootstrap path instead of throwing. | `execution/phase-01/auto-init-no-baseline.json` |
| P01-AC2 | Existing baseline selects candidate-only path and does not run baseline. | `execution/phase-01/candidate-only-existing-baseline.json` |
| P01-AC3 | Summary artifact records selected path, baseline id, candidate run id, compare path, and promotable state. | `execution/phase-01/lifecycle-summary-schema.json` |
| P01-AC4 | `npm run lab:status` remains the authority for current baseline pointer. | `execution/phase-01/status-after-auto-init.json` |
| P01-AC5 | `package.json` exposes `lab:auto` and `lab:auto:promote` scripts with documented output schema. | `execution/phase-01/package-script-contract.log` |

## Required Checks

- `node --test tests/harness-lab-contract.test.mjs`
- `npm run lab:status`
- Docker lifecycle run using `npm run lab:auto` against a temporary lab state root or fixture state.

## Out of Scope

- Strict improvement policy.
- Automatic source commit.
- Live account-root installation.
