# Phase 04 - SWE-bench Adapter v1

## Status

Status: blocked-on-local-scorer-and-dependency-decision

## Objective

Add an adapter path that can run selected SWE-bench tasks through the Moonshot harness loop and import SWE-bench verifier results into `lab-result.json` without making SWE-bench the Moonshot authority.

This phase has two separate readiness levels:

- `adapter_contract_ready`: fake SWE-bench-like fixture proves conversion, patch capture, verifier import, and metric mapping.
- `real_swe_bench_ready`: a real SWE-bench dependency mode is selected and one small real task verifier result is imported.

Only `real_swe_bench_ready` satisfies the user's requirement to run SWE-bench through the Moonshot harness. Fake-only evidence is useful but remains `phase_gated_real_execution_deferred`.

## Owned Paths

- `tools/adapters/**` or `tools/evals/**` for the adapter
- `tests/fixtures/**` for tiny fake SWE-bench-like tasks
- `tests/**` for adapter contract tests
- `docs/public/guidelines/**` for operating notes

## Read-Only Paths

- `tools/harness-lab/harness-lab.mjs`
- `package/package-contract.yaml`
- `docs/public/guidelines/harness-bootstrap-lab.md`

## Surface Classification

| Surface | Classification | Mutation Policy |
|---|---|---|
| adapter source and tests | `source_only` | allowed |
| external SWE-bench dependency/runtime | `external_deployment_or_service` | blocked until dependency decision |
| generated task worktrees and verifier logs | `data_or_state_migration` | run-local only |
| package/runtime payload | `package_runtime_payload` | blocked unless a later packaging decision requires it |

## Required Behavior

Adapter flow:

```text
SWE-bench task
Moonshot task package conversion
isolated checkout or container execution
Moonshot harness/agent loop execution
patch artifact capture
SWE-bench verifier execution
verifier metric import into lab-result.json
```

The adapter must record:

- task id
- source repository and commit
- dependency/version pin
- execution sandbox mode
- patch artifact path and hash
- verifier command and result
- imported metric path used by `harness-lab`

## Adapter CLI Contract

Minimum commands:

```text
node tools/adapters/swe-bench-adapter.mjs convert --task-json <path> --out <runRoot>/swe-task --json
node tools/adapters/swe-bench-adapter.mjs run-fake --fixture <path> --out <runRoot> --json
node tools/adapters/swe-bench-adapter.mjs verify --worktree <path> --out <runRoot>/verifier-result.json --json
node tools/adapters/swe-bench-adapter.mjs import-result --verifier-result <path> --lab-result <path> --json
```

The adapter may later add a single `run` command, but the split commands above are the contract required for debuggable conversion, execution, verification, and result import.

## Adapter Output Contract

```json
{
  "schemaVersion": "moonshot-swe-bench-adapter-result.v1",
  "adapterVersion": "1",
  "mode": "fake|local_docker|external_installed_harness",
  "realExecutionEnabled": false,
  "task": {
    "taskId": "string",
    "repo": "owner/name",
    "baseCommit": "sha"
  },
  "moonshotTaskPackage": {
    "path": "<runRoot>/swe-task",
    "sha256": "sha256:<hex>"
  },
  "patch": {
    "path": "<runRoot>/candidate.patch",
    "sha256": "sha256:<hex>"
  },
  "verifier": {
    "status": "passed|failed|skipped",
    "command": "string",
    "resultPath": "<runRoot>/verifier-result.json",
    "failureClass": "none|swe_bench_dependency_missing|swe_bench_verifier_failure|external_dependency_skipped"
  },
  "metrics": {
    "resolved": 0,
    "testsPassed": 0,
    "testsFailed": 0
  }
}
```

## Dependency Decision Required Before Real SWE-bench Run

One of these must be selected and documented before running real SWE-bench tasks:

- local Docker-based SWE-bench harness
- separately installed external SWE-bench harness
- skipped real execution with fake fixture only

The decision must record installation cost, isolation boundary, network use, disk use, cleanup path, and rollback path.

## SWE_BENCH_DEPENDENCY_DECISION.md Template

Required path before real execution:

`docs/implementation/harness-improvement-loop-lab-2026-06-24/planning-loop/SWE_BENCH_DEPENDENCY_DECISION.md`

Required fields:

```yaml
decision:
  mode: local_docker | external_installed_harness | fake_only_deferred_real
  pinnedRepoOrImage: ""
  versionOrDigest: ""
  networkPolicy: none | install_only | runtime_required
  diskBudget: ""
  sandboxBoundary: ""
  cleanupCommand: ""
  rollbackCommand: ""
  realExecutionStatus: selected | explicitly_deferred
  skipReason: ""
  approvedBy: ""
```

`fake_only_deferred_real` may close adapter-contract work but must not be reported as real SWE-bench readiness.

## Acceptance Criteria

- Fake SWE-bench-like fixture proves task conversion, patch capture, verifier import, and metric extraction, and records `phase_gated_real_execution_deferred` when real execution is not selected.
- Real SWE-bench execution remains skipped until dependency decision exists.
- If real execution is selected, one small task produces a verifier result imported into lab quantitative metrics.
- Real SWE-bench readiness is not complete unless `realExecutionEnabled: true` and verifier status is imported into `lab-result.json.quantitative`.
- SWE-bench result is evidence input; H0 lab remains the promotion authority.

## Required Evidence

- Adapter contract tests.
- Fake fixture lab result.
- Dependency decision note.
- Optional real SWE-bench verifier result if explicitly enabled.

## Out of Scope

- Full SWE-bench leaderboard runs.
- Replacing Moonshot verification authority with SWE-bench.
- Live profile installation.

## Phase 04 Closeout

Status: complete

The fake/deferred adapter contract is implemented by `tools/adapters/swe-bench-adapter.mjs`. Real SWE-bench execution remains explicitly deferred by `planning-loop/SWE_BENCH_DEPENDENCY_DECISION.md`.
