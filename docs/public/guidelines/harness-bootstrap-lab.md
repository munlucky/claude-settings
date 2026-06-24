# Harness Bootstrap Lab

The Harness Bootstrap Lab is the H0 control point for testing Moonshot Relay harness changes. It must stay smaller than the harness it tests and must not import candidate harness modules for its verdict.

## Trust Boundary

- H0 writes `lab-result.json`.
- H1 stable and H2 candidate harnesses only write their own command outputs.
- Candidate `verify.json`, `score.json`, runtime-state projections, or chat output are evidence inputs, not promotion authority.
- `lab-result.json` uses `authority: "external-bootstrap-lab"` to make that boundary machine-checkable.
- Lab run output lives outside the candidate repository by default under `.moonshot-relay/harness-lab-runs/<runId>/`.

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

The built-in suite currently checks package materialization dry-run, the harness control-plane golden eval, and the lab contract tests. Use `npm run test:lab` for the candidate-only default gate.

Candidate-only runs are smoke evidence. They can block a bad candidate, but they do not prove improvement unless they are compared with a stable or baseline run for the same fixture identity.

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

## Fixture Artifact Scoring

Use the artifact scorer when stable and candidate runs must be compared against the same document, plan, or evidence input:

```bash
node tools/evals/artifact-scorer.mjs score \
  --manifest tests/fixtures/harness-improvement-loop/fixture-manifest.json \
  --fixture-id plan-package-minimal-valid \
  --output-root C:/path/to/generated/artifacts \
  --json
```

Stable/candidate improvement claims require matching `fixtureSetId`, `fixtureId`, `inputHash`, and scorer version. A mismatch blocks promotion with `fixture_identity_mismatch`.

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

The guard excludes volatile or very large runtime payload directories such as `logs`, `cache`, `sessions`, `node_modules`, `plugins`, `backups`, `runtimes`, `state`, `projects`, and temp/lock files. It also excludes known live Codex runtime files such as `models_cache.json`, `.codex-global-state.json`, `logs_N.sqlite*`, and `state_N.sqlite*`; these may change while the Codex Desktop host is running and are not evidence that the candidate suite wrote to account root. Durable profile files such as `config.toml`, `AGENTS.md`, rules, and profile settings remain protected. Suite child processes still receive temp homes so lab writes should not target those real roots.

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

The freeze manifest records the Git source fingerprint, package tarball SHA-256, Node version, and platform. The tarball is the stable execution artifact equivalent for this Node-based harness.

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
