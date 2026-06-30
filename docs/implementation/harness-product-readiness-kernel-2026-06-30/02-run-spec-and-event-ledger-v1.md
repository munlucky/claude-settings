# Phase 02 - Run Spec and Event Ledger v1

## Metadata

```yaml
phase:
  id: "02"
  title: Run Spec and Event Ledger
  status: source_first_ready
  dependsOn: []
  surfaceClassification:
    - source_only
    - data_or_state_migration
  ownedPaths:
    - tools/harness-lab/harness-loop.mjs
    - tools/harness-lab/harness-lab.mjs
    - scripts/lib/event-ledger.mjs
    - tests/harness-lab-contract.test.mjs
    - tests/event-ledger-contract.test.mjs
    - docs/public/guidelines/harness-bootstrap-lab.md
  readOnlyPaths:
    - package.json
  stagedGeneratedWritePaths:
    - .moonshot-relay/harness-lab/runs/<run-id>/run-spec.json
    - .moonshot-relay/harness-lab/runs/<run-id>/events.jsonl
  writeSetBoundary: "Source helpers/tests plus new generated run-spec.json and events.jsonl under the active lab run root only; existing baseline manifests and prior run artifacts are read-only unless the current command already owns promotion/calibration writes."
  liveMutationPolicy: "Generated run state only; no account-root/profile mutation."
  policySources:
    - docs/public/guidelines/harness-bootstrap-lab.md
    - docs/public/guidelines/resumable-session-layer.md
    - docs/public/repository-layout.md
```

## Goal

Add a common run kernel to harness-lab runs:

```text
runs/<run-id>/
  run-spec.json
  events.jsonl
  lab-result.json
  candidate-summary.json
  lab-closeout-receipt.json
```

This phase provides the immutable specification and append-only event evidence needed before lifecycle UX commands are introduced.

## Run Spec Contract

`run-spec.json` must be written before run execution and include:

- `schemaVersion: "moonshot-run-spec.v1"`
- `runId`
- `createdAt`
- `objective`
- `scope`
- `backend`
- `candidateRoot`
- `baselineRef` or `baselineId` when applicable
- `fixtureSetId`
- `scorerVersion`
- `allowedMutationBoundary`
- `accountRootBoundary`
- `timeoutBudget`
- `retryBudget`
- `promotionCriteria`
- `outputContract`
- `specHash`

Immutability rule:

- after `run_started`, the spec file must not be rewritten;
- a changed objective, fixture set, scoring policy, backend, or mutation boundary creates a new run id;
- lifecycle `evolve` writes a new spec, never edits the old spec.

Hash and binding rule:

- `specHash` is `sha256` over canonical JSON with keys sorted recursively, paths normalized to portable `/` separators, and the `specHash` field omitted.
- Absolute workspace paths must be recorded in a pair of fields: `path` for the operator-facing path and `portablePath` for hash input when the path is under the repo or generated state root.
- `run.spec_written.payload.specHash` must equal `run-spec.json.specHash`.
- `run.started`, `lab-result.json.run.specHash`, compare reports, candidate summaries, closeout receipts, and lifecycle verdicts must carry the same `specHash` when the artifact is available.
- If legacy runs lack `specHash`, readers report `legacy_run_spec_missing` and may continue only in compatibility mode; new promotion evidence must include it after this phase ships.

## Event Ledger Contract

`events.jsonl` must use the existing hash-chain semantics from `scripts/lib/event-ledger.mjs` or a compatible common helper.

Required event vocabulary for lab runs:

| Event | Required For | Required Payload | Order |
| --- | --- | --- | --- |
| `run.spec_written` | all new runs | `runId`, `specPath`, `specHash` | first |
| `run.started` | all new runs | `runId`, `specHash`, `lifecyclePath`, `backend` | after spec |
| `fixture.loaded` | benchmark/eval/research suites | `fixtureSetId`, `fixtureId`, `inputHash`, `scorerVersion` | before command events for that fixture |
| `command.started` | each command execution | `commandId`, `suiteId`, `cwd`, `timeoutMs` | before matching completion |
| `command.completed` | each command execution | `commandId`, `exitCode`, `durationMs`, `status` | after matching start |
| `artifact.written` | each authoritative artifact | `artifactKind`, `path`, `sha256` | after artifact write |
| `boundary.checked` | account-root/container/generated-state checks | `boundary`, `status`, `findingIds` | before verdict |
| `metric.extracted` | metric-bearing suites | `metricId`, `numericValue`, `verdict`, `failureClass` | before verdict |
| `verdict.written` | evaluate/closeout paths | `verdictPath`, `status`, `sha256` | before terminal event |
| `promotion.blocked` | failed compare/promotion | `reason`, `blockingGates` | before terminal event |
| `promotion.eligible` | passing compare before explicit promotion | `compareReportPath`, `policyMode` | before promotion completed or terminal event |
| `promotion.completed` | explicit promotion | `baselineId`, `manifestPath`, `pointerSha256` | before terminal event |
| `run.cancelled` | cancel path | `reason`, `cancelledBy` | terminal |
| `run.completed` | non-cancel terminal path | `status`, `resultPath` | terminal |

Existing `phase.*` events in `scripts/lib/event-ledger.mjs` remain supported for phase-runner replay. Lab run-kernel readers must not reinterpret old `phase.*` events as lab lifecycle events unless a compatibility adapter explicitly maps them and records `compatibilitySource: "phase_event_legacy"`.

Rules:

- sequence must be monotonic;
- `previousHash` and `eventHash` must verify;
- terminal events are `run.cancelled` or `run.completed`;
- `status` projections are derived from verified events plus artifacts, not from an unverified last string.
- optional events are allowed only when the lifecycle path does not execute the relevant surface, for example `fixture.loaded` can be absent from auth-smoke if no fixture suite runs.

## Acceptance Criteria

| ID | Criterion | Evidence |
| --- | --- | --- |
| P02-AC1 | Candidate, init, calibrate, refresh-baseline, and auth-smoke paths write `run-spec.json` where applicable. | harness-loop contract test |
| P02-AC2 | Lab runs append required event types in order and verify the hash chain. | event-ledger test |
| P02-AC3 | Tampered events fail verification and lifecycle projection. | event-ledger negative test |
| P02-AC4 | Spec mutation after `run.started` is rejected or creates a new run. | run-spec immutability test |
| P02-AC5 | Existing `candidate-summary.json` and `lab-closeout-receipt.json` remain compatible. | harness-lab contract test |

## Validation Gates

Supporting checks:

```powershell
node --test tests/event-ledger-contract.test.mjs
node --test tests/harness-lab-contract.test.mjs
```

Required gate:

```powershell
npm run test:lab
```

For broad changes to `tools/harness-lab/**`, run:

```powershell
npm run test:package
npm run test:eval
npm test
```

## Open Risks

- A second JSONL authority can split from runtime-state authority. This phase must label lab `events.jsonl` as run-local evidence, not whole-plan completion authority.
- Event names should be stable before research and lifecycle commands consume them.
