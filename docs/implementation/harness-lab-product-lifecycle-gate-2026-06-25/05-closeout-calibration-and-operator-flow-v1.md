# Phase 05 - Closeout, Calibration, and Operator Flow v1

Status: planned

## Execution Metadata

```yaml
phaseMetadata:
  phaseId: "05"
  title: "Closeout, Calibration, and Operator Flow"
  status: planned
  dependsOn:
    - "01"
    - "02"
    - "03"
    - "04"
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - tools/harness-lab/harness-loop.mjs
    - tools/harness-lab/harness-lab.mjs
    - tests/harness-lab-contract.test.mjs
    - docs/public/guidelines/harness-bootstrap-lab.md
    - docs/implementation/harness-lab-product-lifecycle-gate-2026-06-25/**
  readOnlyPaths:
    - package/package-contract.yaml
    - schemas/verification.contract.yaml
    - live account-root profiles
  writeSetBoundary:
    allowed:
      - tools/harness-lab/**
      - tests/**
      - docs/**
      - .moonshot-relay/harness-lab/** as generated evidence only
    forbidden:
      - automatic git commit or push
      - live account-root profile mutation
      - Docker registry publish
      - package runtime payload adoption
  requiredEvidenceSlots:
    - calibration_policy_report
    - baseline_rerun_required_case
    - lab_closeout_receipt
    - operator_command_docs
    - final_product_lifecycle_smoke
    - closeout_status_enum_tests
```

## Objective

Provide the operator-level lifecycle contract that lets future harness improvements start, evaluate, promote, close out, and roll back without guessing.

## Required Behavior

- Candidate loop must report whether baseline calibration is required.
- Calibration path must be explicit and rerun both baseline and candidate only through `npm run lab:calibrate`.
- `npm run lab:auto` with an existing baseline must remain candidate-only. If calibration triggers fire, it writes a closeout receipt with `status: calibration_required` and does not rerun baseline automatically.
- Normal path must remain candidate-only when current baseline is valid.
- Lab closeout receipt must be emitted after successful compare/promote or after a blocked candidate.
- Closeout receipt must not commit source. It must tell the operator which commit workflow can consume the evidence.
- Public docs must describe:
  - no-baseline bootstrap
  - existing-baseline candidate run
  - strict improvement vs no-regression policy
  - auth/dev smoke separation
  - promote
  - rollback
  - closeout receipt

## Calibration Triggers

Baseline rerun is required when any condition is true:

- scorer version changed
- fixture set changed
- Docker image id or base image digest changed
- Node major version changed
- stored baseline is older than the configured freshness window
- candidate score is near threshold
- suite uses external API, model endpoint, wall-clock data, or marked nondeterministic judge
- previous baseline artifact integrity check fails

## Closeout Receipt Shape

```json
{
  "schemaVersion": "moonshot-harness-lab-closeout-receipt.v1",
  "status": "promoted_ready_for_commit_workflow",
  "decisionReason": "compare_passed_and_promoted",
  "blockingGates": [],
  "baselineId": "baseline-0008",
  "previousBaselineId": "baseline-0007",
  "baselinePointerBefore": { "baselineId": "baseline-0007", "sha256": "..." },
  "baselinePointerAfter": { "baselineId": "baseline-0008", "sha256": "..." },
  "candidateRunId": "candidate-...",
  "candidateRunSha256": "...",
  "compareReportPath": ".moonshot-relay/harness-lab/compare/...",
  "compareReportSha256": "...",
  "promotionPolicy": { "mode": "no_regression" },
  "promotionStatus": "promoted",
  "runtimeGate": { "status": "healthy", "artifact": "installed-runtime-smoke.json" },
  "calibrationStatus": "not_required",
  "sourceFingerprint": {
    "head": "...",
    "tree": "...",
    "statusShort": "...",
    "dirtyPatchSha256": "...",
    "untrackedSha256": "...",
    "packageLockSha256": "..."
  },
  "nextAction": "run explicit commit workflow if source changes should be committed"
}
```

Allowed receipt statuses:

```text
promoted_ready_for_commit_workflow
rejected_no_commit
blocked_hard_gate
calibration_required
```

Only `promoted_ready_for_commit_workflow` may be consumed by a commit workflow. All other statuses must explicitly set `nextAction` to fix, rerun, calibrate, or reject.

## Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| P05-AC1 | Candidate loop reports calibration not required for current valid baseline. | `execution/phase-05/calibration-not-required.json` |
| P05-AC2 | Scorer version or near-threshold condition reports calibration required. | `execution/phase-05/calibration-required.json` |
| P05-AC3 | Calibration path reruns baseline and candidate and writes compare artifact. | `execution/phase-05/calibration-run-report.json` |
| P05-AC4 | Closeout receipt is written for promoted candidate and contains compare hash and source fingerprint. | `execution/phase-05/lab-closeout-receipt-promoted.json` |
| P05-AC5 | Closeout receipt is written for rejected candidate and does not update baseline pointer. | `execution/phase-05/lab-closeout-receipt-rejected.json` |
| P05-AC6 | Public guide documents exact operator commands for the lifecycle. | `execution/phase-05/operator-doc-keyword-audit.txt` |
| P05-AC7 | Rejected, blocked, and calibration-required receipts cannot be consumed by commit workflow. | `execution/phase-05/closeout-status-negative-tests.log` |

## Required Checks

- `node --test tests/harness-lab-contract.test.mjs`
- `npm run lab:status`
- Docker lifecycle smoke covering no-baseline or fixture state, candidate-only, promote, rollback, and closeout receipt
- `npm test`

## Out of Scope

- Automatic git commit.
- Automatic push or PR creation.
- Live account-root profile adoption.
- Dashboard UI.
