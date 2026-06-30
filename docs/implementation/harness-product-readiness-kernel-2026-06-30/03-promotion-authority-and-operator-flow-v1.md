# Phase 03 - Promotion Authority and Operator Flow v1

## Metadata

```yaml
phase:
  id: "03"
  title: Promotion Authority and Operator Flow
  status: source_first_ready_after_phase_01_02
  dependsOn:
    - "01"
    - "02"
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - docs/public/guidelines/harness-bootstrap-lab.md
    - tools/harness-lab/harness-loop.mjs
    - tools/harness-lab/harness-lab.mjs
    - tests/harness-lab-contract.test.mjs
  readOnlyPaths:
    - .moonshot-relay/harness-lab/**
    - package.json
  writeSetBoundary: "Preserve existing promotion authority; only extend summaries/docs/tests for run kernel binding."
  liveMutationPolicy: "No auto-commit and no live profile/account-root mutation."
  policySources:
    - docs/public/guidelines/harness-bootstrap-lab.md
    - docs/public/reference/runtime-skill-surface.md
```

## Goal

Make the current H0 lab promotion path explicit as the normal proof path for harness improvement work:

```powershell
npm run lab:status
# edit source
npm run lab:candidate
npm run lab:candidate:promote:no-regression
npm run lab:closeout
```

Strict improvement is reserved for phases that add a metric or fixture where positive improvement can be measured:

```powershell
npm run lab:candidate:promote:strict
```

## Authority Rules

- `test:lab` and `lab:candidate` are smoke/lifecycle evidence.
- Improvement proof requires compare against current baseline or stable result.
- Promotion requires complete fixture identity, runtime gate health, compare report pass, candidate/baseline binding, Docker image identity where applicable, and pointer compare-and-swap evidence.
- Commit workflow may consume only a revalidated `lab-closeout-receipt.json` with `status: "promoted_ready_for_commit_workflow"`.
- Whole-plan completion authority remains runtime-state completion assessment, not lab closeout.

Closeout receipt status vocabulary:

| Status | Commit-consumable | Meaning |
| --- | --- | --- |
| `promoted_ready_for_commit_workflow` | yes | Current promoted receipt revalidates pointer, hashes, runtime gate, fixture identity, Docker identity when applicable, and source fingerprint. |
| `rejected_no_commit` | no | Candidate passed or failed in a way that did not produce a promoted current baseline. |
| `blocked_hard_gate` | no | Compare, runtime, fixture, artifact, boundary, or promotion gate failed. |
| `calibration_required` | no | Candidate cannot be fairly judged against stored baseline until explicit calibration reruns baseline/candidate. |

`lab:closeout` may default to the latest receipt, but it exits `0` only when `consumableByCommitWorkflow: true`; all other statuses exit non-zero and must be treated as non-consumable.

## Operator Flow Contract

| Step | Command | Output |
| --- | --- | --- |
| Inspect baseline | `npm run lab:status` | current baseline id, backend, runtime gate summary |
| Run candidate smoke | `npm run lab:candidate` | `runs/<run-id>/lab-result.json`, compare report, candidate summary, closeout receipt |
| Promote no-regression | `npm run lab:candidate:promote:no-regression` | new baseline manifest and pointer only if compare passes |
| Promote strict | `npm run lab:candidate:promote:strict` | new baseline only when positive delta threshold passes |
| Revalidate closeout | `npm run lab:closeout` | `consumableByCommitWorkflow: true` only for current promoted receipt |
| Calibrate | `npm run lab:calibrate` | fresh baseline/candidate rerun with explicit calibration evidence |

## Acceptance Criteria

| ID | Criterion | Evidence |
| --- | --- | --- |
| P03-AC1 | Candidate-only summaries stay `smoke_only` or non-improvement evidence. | harness-lab negative test |
| P03-AC2 | Compare report and closeout receipt reference `run-spec.json` and verified `events.jsonl` when Phase 02 artifacts exist. | contract test |
| P03-AC3 | `lab:closeout` rejects stale pointer, stale source fingerprint, unhealthy runtime gate, incomplete fixture identity, or hash mismatch. | existing and extended closeout tests |
| P03-AC4 | Public operator docs distinguish no-regression safety from strict improvement. | doc keyword audit |
| P03-AC5 | Calibration remains explicit and non-default. | contract test |

## Validation Gates

Supporting check:

```powershell
node --test tests/harness-lab-contract.test.mjs
```

Required gates:

```powershell
npm run lab:candidate
npm run lab:candidate:promote:no-regression
npm run lab:closeout
```

Use `npm run lab:candidate:promote:strict` only when the phase introduces a metric expected to improve.

## Open Risks

- Promotion authority can be diluted if doctor or research fixture outputs are treated as direct promotion proof. This phase must keep the lab compare report as H0 authority.
- Running Docker promotion gates can be slow; targeted tests still need to prove negative contracts before full candidate promotion.
