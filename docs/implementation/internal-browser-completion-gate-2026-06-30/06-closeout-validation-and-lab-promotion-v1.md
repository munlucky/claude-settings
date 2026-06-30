# Phase 06 - Closeout Validation and Lab Promotion v1

Status: complete

## Goal

Close the implementation with source tests, package/eval/lab validation, and a fresh H0 lab receipt that commit workflows can consume.

## Execution Metadata

```yaml
phase: "06"
dependsOn:
  - "01-authority-and-result-contract-v1.md"
  - "02-preview-fixture-runner-v1.md"
  - "03-playwright-artifact-normalization-v1.md"
  - "04-agentic-browser-confirmation-v1.md"
  - "05-repair-loop-and-done-gate-v1.md"
surfaceClassification:
  - path: "package.json"
    classification: source_only
  - path: "package/package-contract.yaml"
    classification: source_only
  - path: ".moonshot-relay/harness-lab/**"
    classification: data_or_state_migration
  - path: "Dockerfile.harness-lab"
    classification: source_only
  - path: "Docker daemon and benchmark image runtime"
    classification: external_deployment_or_service
ownedPaths:
  - "package.json"
  - "package/package-contract.yaml"
  - "Dockerfile.harness-lab"
  - "tests/package-materialization.test.mjs"
  - "tests/workflow-e2e-contract.test.mjs"
  - "tests/verification-plane-contract.test.mjs"
  - "tests/review-bundle-contract.test.mjs"
  - "tests/review-finding-contract.test.mjs"
  - "docs/public/repository-layout.md"
  - "docs/public/runtime-control-plane.md"
  - "docs/public/guidelines/verification-workflow-evidence.md"
readOnlyPaths:
  - "%USERPROFILE%/.moonshot-relay/**"
  - "%USERPROFILE%/.codex/**"
  - "%USERPROFILE%/.claude/**"
generatedEvidenceWritePaths:
  - ".moonshot-relay/harness-lab/**"
  - ".moonshot-relay/harness-lab-runs/**"
  - ".moonshot-relay/browser-artifacts/**"
writeSetBoundary: "Source closeout support only. Generated lab state is produced only by lab commands and is not committed."
conflicts:
  - "manual edits to generated lab state"
  - "claiming whole-plan completion from lab closeout without runtime-state accepted decision"
stagedPaths:
  - "package.json"
  - "package/package-contract.yaml"
  - "Dockerfile.harness-lab"
  - "tests/package-materialization.test.mjs"
  - "tests/workflow-e2e-contract.test.mjs"
  - "tests/verification-plane-contract.test.mjs"
  - "tests/review-bundle-contract.test.mjs"
  - "tests/review-finding-contract.test.mjs"
  - "docs/public/repository-layout.md"
  - "docs/public/runtime-control-plane.md"
  - "docs/public/guidelines/verification-workflow-evidence.md"
adoptionTargets:
  - "source checkout only"
liveMutationPolicy: "No account-root/profile/live service mutation. Lab and browser generated evidence is written only by lab or verification commands and is never committed."
policySources:
  - "package.json"
  - "docs/public/guidelines/harness-bootstrap-lab.md"
  - "docs/public/reference/runtime-skill-surface.md"
  - "docs/public/repository-layout.md"
requiredEvidence:
  - "doctor pass"
  - "package/eval/test gates"
  - "candidate lab run"
  - "promotion receipt"
  - "lab closeout with consumableByCommitWorkflow=true"
  - "two-iteration review-critique-loop receipt with no unresolved blocking findings"
  - "runtime-state accepted completion decision for current run/goal/source fingerprint"
```

## Required Work

- Ensure generated browser artifacts are excluded from package payloads.
- Run source gates.
- Run H0 lab candidate loop.
- Promote with `no_regression` unless Phase 03 or Phase 05 adds a new positive metric/fixture that makes strict improvement meaningful.
- Use `strict_improvement` only after a measurable browser/integration metric exists and improves.
- Keep `lab:auth-smoke` separate from score/improvement decisions.
- Require `planning-loop/plan-quality-review-iter-02.yaml` for the plan package and phase-local review-critique-loop receipt evidence for implementation closeout.
- Confirm accepted critique is represented in source tests, verification-plane quality evidence, or runtime-state blocker evidence.
- If `calibration_required` appears, run explicit calibration instead of silently rerunning baseline.

## Acceptance Criteria

- `npm run lab:status` identifies the active baseline at execution time; no plan hard-codes a stale baseline id.
- `npm run lab:candidate` writes candidate evidence.
- `npm run lab:candidate:promote:no-regression` promotes only a passing candidate.
- `npm run lab:closeout` reports `consumableByCommitWorkflow: true` for the promoted current-source receipt.
- `planning-loop/plan-quality-review-iter-02.yaml` exists and there are no unresolved blocking review findings.
- `node scripts/runtime-state.mjs assess-completion --run-id <runId> --goal-id <goalId> --json` reports `status: "accepted"` before whole-plan completion is claimed.
- Package dry-run proves generated browser traces, screenshots, videos, reports, and runtime verdicts are excluded.

## Gates

```powershell
node scripts/doctor.mjs check --json
npm test
npm run test:package
npm run test:eval
npm run test:lab
npm run lab:status
npm run lab:candidate
npm run lab:candidate:promote:no-regression
npm run lab:closeout
node --test tests/review-bundle-contract.test.mjs tests/review-finding-contract.test.mjs
node scripts/verification-plane.mjs record-summary --run-id <runId> --goal-id <goalId> --profile runtime_adapter --planes-json '<json>' --identity-json '<json>' --json
node scripts/runtime-state.mjs assess-completion --run-id <runId> --goal-id <goalId> --json
```

Optional only after metric expansion:

```powershell
npm run lab:candidate:promote:strict
```

Auth capability smoke remains separate:

```powershell
npm run lab:auth-smoke
```

## Phase Closeout

Closeout requires a fresh closeout receipt for the current source fingerprint. Older receipts that fail `source_fingerprint_matches_receipt` are not commit-consumable.

## Implementation Decision

- Accepted the independent review finding that `doctor` readiness is not commit-consumable by itself; Phase 06 uses `lab:closeout` revalidation as the commit workflow evidence.
- Accepted the packaging review finding that the generated common package profile also needs source/package exclusion proof; added `package/moonshot-relay/profile/` exclusions and broadened materialization tests across common, Claude, and Codex payloads.
- `npm run lab:candidate` returned `calibration_required`; followed the explicit calibration path before final closeout.
- Runtime completion authority was recorded through `verification-plane record-summary` and finalized by `runtime-state assess-completion status=accepted` for run `phase06-closeout-20260630-091137` and goal `internal-browser-completion-gate-2026-06-30`.
