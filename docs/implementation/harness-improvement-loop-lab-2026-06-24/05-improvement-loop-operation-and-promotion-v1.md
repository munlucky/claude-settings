# Phase 05 - Improvement Loop Operation and Promotion v1

## Status

Status: blocked-until-quantitative-gates-exist

## Objective

Document and test the operator loop for using the lab to improve the harness: baseline, candidate, compare, promote, rollback, and preserve evidence.

This phase turns the lab into an operating loop. It does not authorize automatic promotion or live account-root adoption.

## Owned Paths

- `docs/public/guidelines/harness-bootstrap-lab.md`
- optional report templates under `templates/**`
- tests that verify the guide and templates expose required fields

## Read-Only Paths

- `tools/harness-lab/harness-lab.mjs`
- `package/package-contract.yaml`
- phase evidence from Phases 01-03

## Surface Classification

| Surface | Classification | Mutation Policy |
|---|---|---|
| operating guide and templates | `source_only` | allowed |
| generated lab runs | `data_or_state_migration` | run-local, not committed |
| package/runtime payload | `package_runtime_payload` | optional only with explicit package decision |
| installed account-root profiles | `installed_profile_or_account_root` | forbidden without explicit live adoption approval |

## Required Behavior

The operating guide must define:

- how to capture a baseline
- how to run a candidate
- how to compare stable/candidate metrics
- how to interpret metric thresholds and regressions
- how to prove account-root isolation
- how to roll back a candidate change
- how to retain or clean generated lab runs
- what evidence is required before package or live profile adoption

## Promotion Input Identity

Improvement claims require:

```yaml
promotionInputs:
  baselineRunId: required
  candidateRunId: required
  fixtureSetId: required
  scorerVersion: required
  labResultPath: required
```

Candidate-only lab runs are smoke evidence. They may block promotion, but they cannot prove improvement without a baseline run for the same `fixtureSetId`, `fixtureId`, `inputHash`, and scorer version.

## Promotion/Rollback State Machine

```yaml
stateMachine:
  states:
    - draft
    - baseline_frozen
    - candidate_recorded
    - compared
    - promotion_eligible
    - promoted_source_only
    - live_adoption_requested
    - rollback_required
    - rolled_back
    - rejected
  transitions:
    draft: [baseline_frozen]
    baseline_frozen: [candidate_recorded]
    candidate_recorded: [compared]
    compared: [promotion_eligible, rollback_required, rejected]
    promotion_eligible: [promoted_source_only, live_adoption_requested, rejected]
    rollback_required: [rolled_back]
    live_adoption_requested: [rejected]
```

Live adoption has no automatic transition in this plan. It requires a separate explicit approval, package/runtime evidence, and installed profile parity evidence.

## Promotion Decision Record

Minimum path for a phase closeout decision:

`execution/phase-XX/promotion-decision.json`

Minimum shape:

```json
{
  "schemaVersion": "moonshot-harness-promotion-decision.v1",
  "decision": "promoted_source_only|rollback_required|rejected|live_adoption_requested",
  "baselineRunId": "string",
  "candidateRunId": "string",
  "fixtureSetId": "string",
  "scorerVersion": "string",
  "labResultPath": "string",
  "approvedBy": "string",
  "approvalMode": "explicit_user|source_phase_closeout|not_approved",
  "blockers": [],
  "rollback": {
    "rollbackReason": "string|null",
    "rollbackCommand": "string|null",
    "rollbackEvidencePath": "string|null",
    "supersedesRunId": "string|null"
  }
}
```

## Rollback Classes

- Source-only rollback: discard or revert source changes in the candidate branch/worktree and rerun the lab.
- Package/runtime payload rollback: restore package allowlist or generated payload source and rerun package dry-run plus lab.
- Live account-root rollback: out of scope for automatic execution in this plan; requires explicit approval, backup manifest, installer rollback evidence, and post-rollback profile parity.

## Retention Policy

- Lab runs referenced by a promotion decision must be retained until the source change is committed or rejected.
- Lab runs used as baseline evidence must not be deleted while the candidate comparison is open.
- Unreferenced failed smoke runs may be cleaned after their failure class and run id are copied into phase evidence.
- Cleanup commands must never target real account-root profile paths.

## Promotion Policy

Promotion requires all of:

- candidate suites passed
- required metrics present
- metric thresholds passed
- baseline and candidate run ids exist for improvement claims
- stable/candidate comparison passed for the same fixture identity
- account-root guard passed
- artifact scorer passed for required fixtures
- lab result persisted outside candidate authority

Rollback is required when any of:

- command failure
- timeout
- metric threshold failure
- metric regression beyond budget
- missing required artifact
- account-root contamination
- output parse failure for required metrics

## Acceptance Criteria

- Public guide contains baseline, candidate, compare, promote, and rollback instructions.
- Guide clearly distinguishes source-only lab validation from live account-root adoption.
- Promotion decision record requires `baselineRunId` and `candidateRunId` before improvement is claimed.
- Rollback evidence distinguishes source-only, package/runtime, and live account-root rollback.
- Tests or grep checks verify the guide names required quantitative and isolation concepts.
- At least one lab result from earlier phases is referenced as example evidence.

## Required Evidence

- Documentation/test evidence introduced by this phase.
- Passing `npm run test:lab`.
- Evidence reference to the latest quantitative lab run.

## Out of Scope

- Building a dashboard UI.
- Running broad SWE-bench.
- Performing live account-root install.

## Phase 05 Closeout

Status: complete

Documented in `docs/public/guidelines/harness-bootstrap-lab.md` and closed with `execution/phase-05/promotion-decision.json`.
