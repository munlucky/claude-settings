# Harness Bootstrap Lab

The Harness Bootstrap Lab is the H0 control point for testing Moonshot Relay harness changes. It must stay smaller than the harness it tests and must not import candidate harness modules for its verdict.

## Trust Boundary

- H0 writes `lab-result.json`.
- H1 stable and H2 candidate harnesses only write their own command outputs.
- Candidate `verify.json`, `score.json`, runtime-state projections, or chat output are evidence inputs, not promotion authority.
- `lab-result.json` uses `authority: "external-bootstrap-lab"` to make that boundary machine-checkable.
- Lab run output lives under the generated lab state root by default at `.moonshot-relay/harness-lab/runs/<runId>/`.

## Default Gate

Run the current candidate checkout:

```bash
node tools/harness-lab/harness-lab.mjs run --candidate-root . --json
```

Run a stable checkout and candidate checkout with the same suite contract:

```bash
node tools/harness-lab/harness-lab.mjs run \
  --stable-root C:/path/to/stable/moonshot-relay \
  --candidate-root C:/path/to/candidate/moonshot-relay \
  --json
```

The built-in suite currently checks package materialization dry-run, the harness control-plane golden eval, the pinned `moonshot-research` fixture suite, and the lab contract tests. Use `npm run test:lab` for the candidate-only default gate.

## Local Loop Setup

Use the loop wrapper when operating the baseline -> candidate workflow locally. The default loop backend is Docker:

```bash
npm run lab:auto
npm run lab:auto:promote
npm run lab:auto:promote:no-regression
npm run lab:auto:promote:strict
npm run lab:init
npm run lab:status
npm run lab:candidate
npm run lab:candidate:promote
npm run lab:candidate:promote:no-regression
npm run lab:candidate:promote:strict
npm run lab:calibrate
npm run lab:refresh-baseline
npm run lab:auth-smoke
npm run lab:closeout
```

`lab:init` creates a detached baseline worktree from `HEAD`, builds or reuses the local `moonshot-relay-harness-lab:local` image, creates source snapshots that exclude `.git`, `.moonshot-relay`, `node_modules`, generated profile payloads, sqlite files, and package tarballs, runs a baseline container against the baseline snapshot, runs a candidate container against the current working tree snapshot, compares the two `lab-result.json` files, and promotes the current candidate to `baseline-0001` only when the compare report passes. Local loop state is generated under:

```text
.moonshot-relay/harness-lab/
  baselines/current.json
  baselines/baseline-0001/
  compare/
  env/
  runs/
  source-snapshots/
  worktrees/baseline-0001/
```

Baseline and calibration worktrees are ephemeral execution state, not authority evidence. The durable evidence is the baseline manifest, candidate summary, compare report, run kernel, event ledger, and closeout receipt under `baselines/**`, `runs/**`, and `compare/**`. Successful bootstrap or calibration runs remove their detached baseline worktree after those artifacts are written. Failed, dirty, or operator-retained worktrees are kept only as short-lived diagnostic state with a retention manifest.

Worktree maintenance commands:

```powershell
npm run lab:worktrees:status
npm run lab:worktrees:prune -- --dry-run
npm run lab:worktrees:prune
```

The prune command only targets detached worktrees under `.moonshot-relay/harness-lab/worktrees/**`. It refuses to remove branch worktrees, dirty or untracked worktrees, and anything outside the harness worktree root. Removal goes through `git worktree remove <path>` followed by `git worktree prune`; it does not delete worktree directories directly. `lab:closeout` may report `maintenance_required` warnings when old generated worktrees remain, but these warnings do not make an otherwise valid `consumableByCommitWorkflow=true` receipt non-consumable.

`lab:auto` is the normal product-level lifecycle entrypoint. If `baselines/current.json` is missing, it selects `initial_bootstrap`, runs baseline and candidate Docker benchmarks, compares them, and promotes a passing candidate as the first current baseline. If the current baseline exists, it selects `candidate_only`, runs only the candidate Docker benchmark, compares against the stored baseline artifact, and writes `runs/<candidate-id>/candidate-summary.json` plus `runs/<candidate-id>/lab-closeout-receipt.json`. `lab:auto:promote` is the explicit promotion variant for existing-baseline candidate runs. Use the `:no-regression` and `:strict` script aliases when an automation needs the policy in the command name instead of relying on the default.

`lab:candidate` runs only a candidate container and compares it with `baselines/current.json`. `lab:candidate:promote` additionally promotes a passing candidate to the next baseline id. `lab:candidate:promote:strict` requires a positive score delta under `strict_improvement`; `lab:candidate:promote:no-regression` allows equal score when all regression gates pass. Host execution is retained for diagnostics through `npm run lab:init:host`, `npm run lab:candidate:host`, and `npm run lab:candidate:promote:host`.

Host Codex auth is never mounted into a candidate benchmark container. `npm run lab:auth-smoke` is the separate opt-in auth/model capability stage. It mounts host Codex auth only into ephemeral container homes, uses network access for the model-backed smoke, does not run benchmark suites, and scans output artifacts for copied `auth.json` or token-like payloads. Legacy `lab:candidate:codex-auth` and `lab:candidate:codex-dev-smoke` scripts route to this separate auth-smoke stage.

New loop runs also write a run-kernel pair under the run root:

```text
runs/<run-id>/run-spec.json
runs/<run-id>/events.jsonl
```

`run-spec.json` uses `schemaVersion: "moonshot-run-spec.v1"` and records the lifecycle path, backend, source boundary, account-root boundary, promotion criteria, fixture set, scorer version, and a self-excluding `specHash`. The hash is calculated over canonical JSON with sorted keys and portable path forms. Reusing a run id with a different spec is rejected as an in-place mutation; a changed objective, fixture set, backend, scorer, or mutation boundary must create a new run.

`events.jsonl` is append-only and hash-chained. New lab-loop runs start with `run.spec_written` and `run.started`, record loop-owned command execution with `command.started` and `command.completed`, record artifact writes, and end with a terminal run event. `lab-result.json`, compare reports, `candidate-summary.json`, and `lab-closeout-receipt.json` carry the same `specHash` when they are produced by the loop wrapper. These run-local events are evidence for the lab run; they are not whole-plan completion authority.

Operator lifecycle controls are available after a run kernel exists:

```bash
npm run lab:run-status -- --run-id <run-id>
npm run lab:resume -- --run-id <run-id>
npm run lab:cancel -- --run-id <run-id> --reason "operator reason"
npm run lab:evaluate -- --run-id <run-id>
npm run lab:evolve -- --run-id <run-id> --out-run-id <new-run-id>
```

`lab:status` remains the baseline-loop readiness command. `lab:run-status` is the run-kernel projection command for a selected run. It reads `run-spec.json`, verifies the self-excluding `specHash`, verifies the hash-chained event ledger, reports terminal state, and marks projections stale when event-recorded artifact hashes no longer match files. `lab:resume` is replay-first and idempotent for terminal runs; the initial implementation does not create a second execution authority for non-terminal runs. `lab:cancel` appends an event-only `run.cancelled` terminal event and does not promise process termination. `lab:evaluate` writes a derived `verdict.json` from verified run evidence, but it records `promotionAuthority: false`; H0 compare/promote evidence remains required for promotion claims. `lab:evolve` creates a new child run spec with parent run id and parent spec hash lineage and never edits the parent spec.

Lifecycle commands may append events and write derived verdicts under `.moonshot-relay/harness-lab/runs/<run-id>/`. They must not edit prior run specs, baseline manifests, compare reports, current baseline pointers, live account-root profiles, or source files.

Docker lifecycle promotion treats `installed-runtime-smoke.json` as a hard gate. `degraded`, `failed`, missing native capability, or blocker metrics fail the run. The lab normalizes the runtime-state `available` status to lifecycle `healthy` only when blocker and stale-warning lists are empty. `install-result.json` is also normalized after the container run; if install verification and profile surface parity are clean, the lab writes top-level `status: "installed"` and records `executionBackend.installStatus: "installed"` in `lab-result.json`. Docker runs record the inspected image identity as `executionBackend.imageId`, `executionBackend.imageDigest`, and `executionBackend.repoDigests`; promotion rejects Docker candidate artifacts without `executionBackend.imageDigest` and promoted baselines copy that identity into `runtimeIdentity` and `artifact.imageDigest` for stronger replay evidence.

The Docker lifecycle is:

```text
no baseline:
  baseline worktree -> baseline container -> baseline lab-result.json
  current worktree -> candidate container -> candidate lab-result.json
  compare candidate vs baseline
  promote candidate as current baseline after passing bootstrap

existing baseline:
  current worktree -> candidate container -> candidate lab-result.json
  compare candidate vs stored baseline artifact
  promote candidate as next baseline only through explicit promote

calibration:
  current baseline source ref -> baseline container -> fresh baseline lab-result.json
  current worktree -> candidate container -> candidate lab-result.json
  compare and optionally promote

legacy baseline refresh:
  verify current baseline is legacy or missing strengthened evidence
  current worktree -> candidate container -> candidate lab-result.json
  self-compare current candidate evidence
  promote as a strengthened current baseline with refresh override evidence
```

Candidate-only runs are smoke evidence and lifecycle evidence. They can block a bad candidate, but they do not prove improvement unless they are compared with a stable or baseline run for the same fixture identity and the selected promotion policy passes.

## Quantitative Gate

`lab-result.json` uses `schemaVersion: "moonshot-harness-lab-result.v1"` for quantitative runs. The H0 lab result remains the promotion authority; candidate `verify.json`, scorer output, adapter output, or chat output are evidence inputs only.

Suite configs may define metrics extracted from stdout JSON:

```json
{
  "id": "harness-control-plane-eval",
  "command": ["<node>", "tools/evals/harness-control-plane.mjs", "run", "--json"],
  "metrics": [
    { "id": "score", "path": "score", "direction": "higher", "min": 1, "maxRegression": 0, "required": true },
    { "id": "failedCount", "path": "failedCount", "direction": "lower", "max": 0, "maxRegression": 0, "required": true }
  ]
}
```

Parsing rules:

- stdout is parsed as a final JSON object.
- metric paths use dot-path v1, such as `score` or `metrics.missingRequiredCount`.
- required missing or non-numeric metrics fail as `metric_missing`.
- unparseable stdout fails as `stdout_json_parse`.
- `direction=higher` regression is `baselineValue - candidateValue`.
- `direction=lower` regression is `candidateValue - baselineValue`.

Metric failures block `promotable` even when the command exits with code 0.

## Research Fixture Gate

The default lab includes a fixed `moonshot-research` fixture from the tracked clean-checkout path:

```text
tests/fixtures/harness-research-fixtures/
  fixture-manifest.json
  2026-06-24/run.json
  2026-06-24/evidence.json
  2026-06-24/claim-ledger.json
  2026-06-24/report.md
```

The scorer is deterministic and network-free:

```bash
node tools/evals/research-fixture-scorer.mjs score \
  --manifest tests/fixtures/harness-research-fixtures/fixture-manifest.json \
  --json
```

It checks evidence count, query variant count, lane failures, primary-source ratio, claim ledger coverage, boundary/access evidence, adjacent repository contamination, and required artifact completeness. The seed pack is intentionally the raw 2026-06-24 evidence pack: its `minimumPrimarySourceRatio` is calibrated to `0.18` with a manifest note that the earlier `0.70` planning draft applies to future filtered-source fixtures, not this raw seed fixture.

## Fixture Artifact Scoring

Use the artifact scorer when stable and candidate runs must be compared against the same document, plan, or evidence input:

```bash
node tools/evals/artifact-scorer.mjs score \
  --manifest tests/fixtures/harness-improvement-loop/fixture-manifest.json \
  --fixture-id plan-package-minimal-valid \
  --output-root C:/path/to/generated/artifacts \
  --json
```

Stable/candidate improvement claims require matching `fixtureSetId`, `fixtureId`, `inputHash`, and scorer version. A value mismatch blocks promotion with `fixture_identity_mismatch`. If either side declares fixture identity but omits any required field, including `inputHash`, promotion is blocked with `fixture_identity_incomplete`.

## Account-Root Isolation

Default lab suites run with run-local homes:

- `MOONSHOT_RELAY_HOME=<runRoot>/homes/<label>/moonshot-relay`
- `PHASE_RUNTIME_DB=<runRoot>/homes/<label>/runtime-state.sqlite`
- `CODEX_HOME=<runRoot>/homes/<label>/codex`
- `CLAUDE_HOME=<runRoot>/homes/<label>/claude`
- `HOME=<runRoot>/homes/<label>/user-home`
- `USERPROFILE=<runRoot>/homes/<label>/userprofile`

The lab fingerprints the real protected account roots before and after execution:

- `%USERPROFILE%/.moonshot-relay`
- `%USERPROFILE%/.codex`
- `%USERPROFILE%/.claude`

Any protected-root change blocks promotion with `account_root_contamination`. Unreadable protected roots block promotion with `account_root_guard_unavailable`.

The guard excludes volatile or very large runtime payload directories such as `logs`, `cache`, `sessions`, `node_modules`, `backups`, `runtimes`, `todos`, `shell-snapshots`, `session-env`, and temp/lock files. It also excludes known live Codex runtime files such as `models_cache.json`, `.codex-global-state.json`, `.codex-global-state.json.bak`, `process_manager/chat_processes.json`, `logs_N.sqlite*`, `state_N.sqlite*`, and sqlite journal sidecars; these may change while the Codex Desktop host is running and are not evidence that the candidate suite wrote to account root. Durable profile files such as `config.toml`, `AGENTS.md`, rules, profile settings, plugin manifests, project records, `state/projects/...` knowledge, tasks, teams, vendor imports, and generated assets remain protected. Suite child processes still receive temp homes so lab writes should not target those real roots.

## SWE-bench Adapter Contract

The source-local adapter contract is available through:

```bash
node tools/adapters/swe-bench-adapter.mjs convert --task-json tests/fixtures/harness-improvement-loop/fake-swe-bench-task.json --out .moonshot-relay/tmp/swe-task --json
node tools/adapters/swe-bench-adapter.mjs run-fake --fixture tests/fixtures/harness-improvement-loop/fake-swe-bench-task.json --out .moonshot-relay/tmp/swe-run --json
```

Fake SWE-bench-like fixtures prove adapter shape only. Real SWE-bench readiness requires a dependency decision at:

```text
docs/implementation/harness-improvement-loop-lab-2026-06-24/planning-loop/SWE_BENCH_DEPENDENCY_DECISION.md
```

Real readiness is not complete unless `realExecutionEnabled: true` and a verifier result is imported into `lab-result.json.quantitative`.

## Promotion And Rollback

Improvement claims require:

- `baselineRunId`
- `candidateRunId`
- `fixtureSetId`
- `scorerVersion`
- persisted `labResultPath`

Promotion states are:

```text
draft -> baseline_frozen -> candidate_recorded -> compared -> promotion_eligible -> promoted_source_only
```

Failures move to `rollback_required` or `rejected`.

Rollback classes:

- Source-only rollback: discard or revert candidate source changes and rerun the lab.
- Package/runtime payload rollback: restore package allowlist or generated payload source and rerun package dry-run plus lab.
- Live account-root rollback: out of scope for automatic lab execution and requires explicit approval plus installer rollback evidence.

Lab runs referenced by promotion decisions must be retained until the source change is committed or rejected. Cleanup commands must never target real account-root profile paths.

## Stable Freeze

Freeze a known-good source snapshot as an npm package artifact and manifest:

```bash
node tools/harness-lab/harness-lab.mjs freeze \
  --source-root C:/path/to/moonshot-relay \
  --out C:/path/to/releases/stable/current \
  --version 2026-06-23
```

The freeze manifest uses `schemaVersion: "moonshot-harness-baseline-artifact.v1"` and records `baselineId`, `authority: "external-bootstrap-lab"`, Git source fingerprint, fixture set, scorer version, package tarball SHA-256, Node version, and platform. The tarball is the stable execution artifact equivalent for this Node-based harness.

## Baseline Compare, Promote, And Rollback

Compare a stored baseline lab result and a candidate lab result:

```bash
node tools/harness-lab/harness-lab.mjs compare \
  --baseline-result .moonshot-relay/harness-lab-runs/baseline/lab-result.json \
  --candidate-result .moonshot-relay/harness-lab-runs/candidate/lab-result.json \
  --promotion-policy no_regression \
  --out .moonshot-relay/harness-lab-runs/compare/candidate-vs-baseline.json \
  --json
```

The compare report uses `schemaVersion: "moonshot-harness-compare-report.v1"` and classifies blocking regressions as `new_failed_task`, `score_drop`, `artifact_contract_break`, `mutation_safety_break`, `stale_evidence_break`, `runtime_regression`, `insufficient_improvement`, `fixture_identity_incomplete`, or `fixture_identity_mismatch`.

Promotion policy is explicit:

- `no_regression` is the default and allows equal score when regressions are zero.
- `strict_improvement` requires `candidate.normalizedScore - baseline.normalizedScore >= minDelta`; the default strict delta is `0.01`.
- `strict_improvement` rejects zero or negative `minDelta`; equal-score strict candidates cannot pass by setting `--min-delta 0`.
- Policy mode, aggregate metric, threshold, score delta, and decision reason are copied into compare reports, candidate summaries, promotion manifests, and closeout receipts.

Promote only after a passing compare report:

```bash
node tools/harness-lab/harness-lab.mjs promote \
  --candidate-run .moonshot-relay/harness-lab-runs/candidate/lab-result.json \
  --compare-report .moonshot-relay/harness-lab-runs/compare/candidate-vs-baseline.json \
  --baseline-root .moonshot-relay/harness-lab-baselines \
  --baseline-id baseline-0002 \
  --expected-previous-baseline-id baseline-0001 \
  --json
```

Promotion validates the candidate run id, compare candidate id, current baseline artifact identity, fixture identity including `inputHash`, promotion policy, candidate runtime gate, Docker image digest, and compare hash before writing a new baseline. Calibration reruns may use `--allow-calibrated-baseline`; normal promotion still rejects compare reports whose baseline run id does not bind to the current baseline pointer. Promotion records pointer evidence with previous baseline id, previous pointer SHA-256, new pointer SHA-256, `manifestPrePointerEvidenceSha256`, lab result hash, and compare report hash. The legacy `manifestSha256` field is retained as an alias for the pre-pointer-evidence manifest hash and carries `manifestSha256Meaning: "pre_pointer_evidence_manifest_hash"` so it is not confused with the final self-containing manifest file hash. Promotion results expose `finalManifestSha256` separately. It then atomically replaces `current.json`. If artifact copy or pointer compare-and-swap fails before replacement, the prior pointer remains active.

Rollback is pointer-only for source-first baselines:

```bash
node tools/harness-lab/harness-lab.mjs rollback \
  --baseline-root .moonshot-relay/harness-lab-baselines \
  --to baseline-0001 \
  --json
```

Rollback validates the target baseline manifest, lab artifact, compare artifact when present, and stored hashes before pointer replacement. It writes a rollback audit artifact under `.moonshot-relay/harness-lab/baselines/`.

## Closeout Receipt

Every lifecycle run writes `lab-closeout-receipt.json`. `lab:closeout` revalidates the receipt against the current baseline pointer, candidate hash, compare hash, artifact-backed runtime gate, complete fixture identity, Docker image digest consistency, promotion manifest, and current source fingerprint before marking it commit-consumable. The CLI exits non-zero when revalidation fails or the receipt is not commit-consumable, so shell gates can use `npm run lab:closeout` directly. Commit workflows may consume only:

```text
promoted_ready_for_commit_workflow
```

Other statuses are blocking or non-consumable:

```text
rejected_no_commit
blocked_hard_gate
calibration_required
```

The receipt records baseline id, previous baseline id, candidate run id, candidate run hash, compare path and hash, promotion policy, runtime gate, calibration status, source fingerprint, run-kernel `specHash` when present, and the next operator action. When a receipt includes `specHash`, `runSpecPath`, and `eventsPath`, closeout revalidation checks that the run spec hash matches the receipt, the event ledger hash chain verifies, and the ledger ends with a terminal event. Stale or mismatched promoted receipts are not commit-consumable. The lab never commits or pushes source changes.

## Container Policy

Local container support is source-only and uses `Dockerfile.harness-lab` plus the Docker backend in `tools/harness-lab/harness-loop.mjs`. It is not package runtime payload and must not publish images.

Audit the required container isolation policy:

```bash
node tools/harness-lab/harness-lab.mjs container-policy --json
```

The candidate benchmark container must mount only its sanitized source snapshot, prepared workspace, prepared Codex CLI, and writable run output. It must not mount baseline outputs, `runs/baseline/**`, `baselines/**`, the host Docker socket, live account-root paths, host Codex auth, or host Codex config. Baseline containers are for initial and calibration loops only; normal loops run candidate-only against stored baseline artifacts.

The default strict run uses `--read-only`, `--network none`, `--cap-drop ALL`, `--security-opt no-new-privileges`, a PID limit, and tmpfs mounts for mutable homes. The homes tmpfs allows native runtime modules to load, while `/tmp` remains `nosuid,nodev`. Dependency installation and Codex CLI installation happen in a separate prepare container before the strict benchmark run.

## Calibration

Stored baseline results are reusable for normal loops. `lab:auto` with an existing baseline remains candidate-only. If scorer version changes, fixture identity changes, candidate score is within the configured margin threshold, Docker/base runtime identity changes, or the baseline includes stale non-deterministic/external dependency markers, the candidate loop reports `calibration_required` and does not rerun baseline automatically. Run `npm run lab:calibrate` to rerun both baseline and candidate explicitly. When a legacy baseline source ref rerun lacks fixture identity but the current baseline manifest has complete identity, calibration writes a separate `lab-result.fixture-normalized.json` compare input; the original rerun artifact remains unchanged and promotion records calibrated-baseline override evidence.

Use `npm run lab:refresh-baseline` only to replace a legacy or incomplete current baseline with strengthened policy, runtime identity, runtime gate, fixture identity, hash, and pointer evidence after the current candidate checkout passes Docker benchmark. The command first checks the current baseline manifest, lab result, and compare report; it fails if the current baseline already has strengthened evidence. This is a baseline evidence refresh, not a proof of improvement over the legacy baseline.

## Custom Suites

Pass `--config <json>` with a suite list:

```json
{
  "schemaVersion": 1,
  "suites": [
    {
      "id": "contract",
      "command": ["<node>", "--test", "tests/harness-lab-contract.test.mjs"],
      "timeoutMs": 120000
    }
  ]
}
```

Use `<node>` and `<npm>` placeholders instead of hard-coded executable paths for Windows and POSIX portability.
