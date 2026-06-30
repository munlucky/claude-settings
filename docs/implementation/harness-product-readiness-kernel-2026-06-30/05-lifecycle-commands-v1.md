# Phase 05 - Lifecycle Commands v1

## Metadata

```yaml
phase:
  id: "05"
  title: Lifecycle Commands
  status: blocked_until_phase_02_and_03_pass
  dependsOn:
    - "02"
    - "03"
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
    - .moonshot-relay/harness-lab/baselines/**
    - .moonshot-relay/harness-lab/compare/**
  stagedGeneratedWritePaths:
    - .moonshot-relay/harness-lab/runs/<run-id>/events.jsonl
    - .moonshot-relay/harness-lab/runs/<run-id>/verdict.json
    - .moonshot-relay/harness-lab/runs/<new-run-id>/run-spec.json
  writeSetBoundary: "Lifecycle commands may append events and write derived verdicts under the active run root; they must not edit prior run specs, baseline manifests, compare reports, or current baseline pointers."
  liveMutationPolicy: "No live profile/account-root mutation."
  policySources:
    - docs/public/guidelines/harness-bootstrap-lab.md
    - docs/public/guidelines/resumable-session-layer.md
```

## Goal

Add operator lifecycle commands after run specs and event ledgers are reliable:

```text
node tools/harness-lab/harness-loop.mjs status --json
node tools/harness-lab/harness-loop.mjs run-status --run-id <run-id> --json
node tools/harness-lab/harness-loop.mjs resume --run-id <run-id> --json
node tools/harness-lab/harness-loop.mjs cancel --run-id <run-id> --reason <text> --json
node tools/harness-lab/harness-loop.mjs evaluate --run-id <run-id> --json
node tools/harness-lab/harness-loop.mjs evolve --run-id <run-id> --out-run-id <new-run-id> --json
```

Existing `lab:status` remains current baseline/loop status. New run-kernel status uses `run-status` to avoid overloading baseline readiness.

Package aliases are optional until implementation selects them; if added, use names such as `lab:run-status`, `lab:resume`, `lab:cancel`, `lab:evaluate`, and `lab:evolve`.

This phase is blocked until Phase 02 proves immutable specs and verified append-only ledgers, and Phase 03 preserves promotion authority.

## Command Contracts

| Command | Behavior | Mutation |
| --- | --- | --- |
| `status` | Reads current baseline pointer, latest run spec, verified events, blockers, and partial artifacts. | read-only |
| `run-status` | Reads a selected run's spec/events/artifacts and reports projection. | read-only |
| `resume` | Rehydrates from `run-spec.json` and verified `events.jsonl`; idempotent if run is terminal. Requires `--run-id`. Exit `0` for terminal no-op, `1` for invalid ledger/spec. | may continue only non-terminal run |
| `cancel` | Appends `run.cancelled` with reason. Initial implementation is event-only and does not promise process termination. Requires `--run-id` and `--reason`. | append terminal event only |
| `evaluate` | Computes verdict from artifacts, metrics, compare report, and verified ledger. Requires `--run-id`. Exit `0` for verdict written, `1` for invalid or incomplete evidence. | writes `verdict.json` |
| `evolve` | Creates next candidate `run-spec.json` from evaluation findings. Requires `--run-id` and `--out-run-id`. | creates new run; never edits old spec |

## Acceptance Criteria

| ID | Criterion | Evidence |
| --- | --- | --- |
| P05-AC1 | `status` rejects tampered ledgers and labels projections stale when artifacts and events disagree. | lifecycle status test |
| P05-AC2 | `resume` is idempotent for terminal runs and refuses runs with invalid spec hash. | resume test |
| P05-AC3 | `cancel` appends a terminal cancellation event and does not rewrite `run-spec.json`. | cancel test |
| P05-AC4 | `evaluate` writes a verdict from artifacts and does not claim promotion without H0 compare authority. | evaluate test |
| P05-AC5 | `evolve` creates a new run id and records parent run lineage. | evolve test |
| P05-AC6 | Public docs explain lifecycle commands as operator controls, not auto-commit or live adoption. | doc audit |

## Validation Gates

Supporting checks:

```powershell
node --test tests/event-ledger-contract.test.mjs
node --test tests/harness-lab-contract.test.mjs
```

Required gates:

```powershell
npm run test:lab
npm run lab:candidate
```

If lifecycle commands affect promotion or closeout:

```powershell
npm run lab:candidate:promote:no-regression
npm run lab:closeout
```

## Open Risks

- Resume can accidentally become a second execution authority. It must replay spec/events and then delegate to existing lab execution paths.
- Cancel must be safe on Windows and container backends; implementation should start with event-only cancellation before process-control expansion.
