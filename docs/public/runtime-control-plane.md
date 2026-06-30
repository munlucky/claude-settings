# Runtime Control Plane

Moonshot Relay runtime-state support is an authoritative local control plane for harness execution state. Source checkout execution uses `scripts/runtime-state.mjs` and `scripts/lib/runtime-state-store.mjs`.

## Storage Authority

- DB path authority is `scripts/lib/runtime-state-db-path.mjs`.
- Default DB location is `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/knowledge/runtime-state.sqlite` through the existing runtime-state root resolver.
- Project-local bridge entrypoints may set `MOONSHOT_RELAY_STATE_ROOT` to `.moonshot-relay/state` before delegating to the shared runtime. This keeps runtime-state authority available in sandboxed downstream workspaces while still resolving executable code through `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}`.
- Legacy `PHASE_RUNTIME_DB` remains a direct DB override for tests and controlled smoke checks.
- Generated sqlite files, WAL, and SHM files are runtime state and must not enter package payloads.

## Workflow Authority Matrix

`runtime-state.sqlite` is the single workflow authority for run status, blockers, resume state, and whole-plan completion decisions. Files such as `.moonshot-relay/docs/phase-status.yaml`, `QA_REPORT.md`, `SCORECARD.md`, closeout JSON, and verifier verdicts are readable projections or evidence payloads. A projection can summarize DB state, but projection files must not become authority for completion, blocker, or resume decisions.

| Workflow path | Required DB authority | Required writer/evidence | Authority boundary |
| --- | --- | --- | --- |
| phase start | `runs`, `goals`, `runtime_events` with `phase.start`, `resume_snapshots` | `prepare-phase-runner-state.mjs` with `runId`, `goalId`, `workspaceId`, and phase identity | opens or resumes a phase run only |
| resume | `runs` lease state, `resume_snapshots`, `runtime_events` with `resume.success` or `resume.failure` | `runtime-state.mjs status --json` and snapshot lineage | reconstructs current state, blocker, and next action from DB read model |
| blocker | `runtime_events` with blocking severity or rejected completion/eval evidence | `record-event`, `record-eval-result`, or `assess-completion` rejection payload | blocks eligibility until resolved, superseded, or carried forward |
| verification evidence | `runtime_events` or verification-plane evidence referenced by runtime-state | fresh command output, verdict JSON, security scan, or profile-specific plane evidence | makes completion assessment eligible, not complete |
| phase closeout | `runtime_events` or `eval_results` carrying phase-local evidence | scorecard, QA, review, and verifier evidence for the current phase | records phase-local evidence; does not require `completion_decisions.status=accepted` |
| commit closeout | `runtime_events` for memory refresh, audit, staging, commit, and install-sync evidence | commit workflow output and filtered staging evidence | records repository closeout evidence, not whole-plan acceptance by itself |
| whole-plan closeout | `completion_decisions` with latest `status=accepted` after `assess-completion` | accepted DB decision with fresh verification-plane evidence and writer identity | only boundary that can claim clean whole-plan completion |

## Native Dependency Decision

Source checkout runtime-state support uses `better-sqlite3@12.10.0`.

`better-sqlite3@12.x` requires Node 20 or newer, so this repository declares `node >=20` and CI covers the supported Node 20 and Node 22 lanes across Linux, Windows, and macOS.

No fallback SQLite adapter is installed. The accepted fallback behavior is typed degradation:

- source checkout with dependencies installed: runtime-state is `available`
- materialized common payload with packaged production dependencies: runtime-state is `available`
- missing native module reason: `missing_native_module`
- typed degraded reasons: `missing_native_module`, `permission_denied`, `sandbox_denied`, `db_lock_timeout`, `schema_mismatch`, `unresolved_db_path`, `schema_or_open_failure`
- degraded status includes `runtimeCapabilityStatus.recoveryHint` and mirrors that reason-specific action in `resumeBrief.nextAction`
- degraded runtime-state must not claim completion authority

This keeps account-root/package rollout conservative while still requiring installed-runtime smoke evidence before availability is claimed.

## Rollout Smoke Matrix

| Target | Command shape | Success status |
| --- | --- | --- |
| source checkout | `node scripts/runtime-state.mjs status --json` | `available` |
| materialized package | set `MOONSHOT_RELAY_HOME=<package>/moonshot-relay/profile`, then run `<package>/moonshot-relay/profile/scripts/runtime-state.mjs status --json` | `available` |
| temp account-root install | set `MOONSHOT_RELAY_HOME=<temp-moonshot-home>`, then run `<temp-moonshot-home>/scripts/runtime-state.mjs status --json` with temp Claude/Codex homes | `available` |
| live account-root install | installed `~/.moonshot-relay/scripts/runtime-state.mjs status --json` after explicit adoption approval | `available` |
| project-local bridge | `moonshot-relay bridge --target <project>`, then run `<project>/scripts/runtime-state.mjs status --json` | `available` with DB under `<project>/.moonshot-relay/state` |

Missing native dependencies must return typed degradation such as `missing_native_module`.
Typed degradation is useful negative-path evidence, but it blocks authority claims and rollout success on supported targets.

## Observability Metrics

`scripts/runtime-state.mjs status --json` exposes `operationalMetrics` at the root, in `compactStatus`, and in `resumeBrief`.
Metrics are derived from runtime-state rows, not hand-written reports.

| Metric | Source evidence | Warning | Blocker |
| --- | --- | --- | --- |
| `completion_false_positive_rate` | `eval_results` completion false-positive suites | non-zero | non-zero |
| `run_resume_success_rate` | `runtime_events` `resume.success` / `resume.failure` | below 0.9 | below 0.75 |
| `tool_invalid_call_rate` | `tool_calls.status` | above 0 | at or above 0.5 |
| `prompt_cache_hit_ratio` | `context.prompt_metrics` / `context.compaction` events | below 0.5 | no direct blocker |
| `context_compaction_ratio` | context metric events | outside 0 to 1 | lost required resume fields |
| `db_busy_timeout_count` | DB timeout runtime events or degraded reasons | non-zero | non-zero |
| `browser_trace_flaky_rate` | `browser.trace` events | non-zero | required trace flaky |
| `security_open_alerts` | `security.review` and verification-plane security evidence | non-zero | non-zero |
| `eval_regression_worsened_count` | `eval_results.regression_worsened` | non-zero | non-zero |
| `memory_promotion_rollback_count` | `memory_promotion_decisions.status = rolled_back` | non-zero | no direct blocker |

Status also surfaces `compactStatus.blockingEvents`, `compactStatus.pendingApprovals`, `compactStatus.evalRegressions`, and `compactStatus.latestVerificationEvidence`.
`compactStatus.latestVerificationEvidence` is a normalized read-model projection of the latest verification event. It can show `taskLocalCompletion.status=complete` for profile-scoped evidence while `wholePlanAuthority.status=blocked`; it is not a completion decision and does not replace `assess-completion`.
Low-score or flaky traces should be linked through eval evidence such as `traceCandidatePath` and converted with `tools/awtl/trace-to-testcase.mjs`.

Team metrics keep `observability.teamMetrics.requiredFields` as deprecated compatibility. New contract consumers should use `decisionFields` for routing, completion, and blocker decisions, and `reportingFields` for model, retry, handoff, and lead-time diagnostics.

## Operations Recovery

When status is degraded, first restore runtime-state capability:

1. Check `runtimeCapabilityStatus.reason`.
2. Check `runtimeCapabilityStatus.recoveryHint` for the reason-specific next action.
3. If `missing_native_module`, rerun dependency materialization or account-root install in a temp home before live adoption.
4. If `permission_denied`, `sandbox_denied`, or `unresolved_db_path`, choose a writable and permitted `MOONSHOT_RELAY_HOME` or state root.
5. If `db_lock_timeout`, inspect long-running sessions, stale leases, and WAL/SHM files under the runtime state root.
6. Run `node scripts/runtime-state.mjs cleanup-stale-leases --json`.
7. Re-run `node scripts/runtime-state.mjs status --run-id <runId> --goal-id <goalId> --json`.

Do not claim clean completion while `operationalMetrics.releaseBlockerMetrics` is non-empty, while pending approvals exist, or while eval regressions are present.

## Required Runtime Settings

Runtime-state DB initialization applies:

- `journal_mode = WAL`
- `busy_timeout = 5000`
- idempotent schema migration through `schema_migrations`

## Schema v1

Schema v1 owns:

- `runs`
- `goals`
- `runtime_events`
- `completion_decisions`
- `resume_snapshots`
- `tool_calls`
- `eval_results`

Completion decisions carry evidence hash, writer identity, decision ordering, and supersede/revoke fields so later completion-authority phases can cut over without changing the DB foundation.

Run leases are stored on `runs` with `workspace_id`, `heartbeat_at`, `lease_expires_at`, `stale_at`, and `stale_reason`. A run is considered active only when it has a non-expired lease. Event-only rows do not become active leases.

## Eval And Review Blockers

`scripts/runtime-state.mjs record-eval-result` records harness regression and review-loop evidence in `eval_results`.

Runtime blockers use event-backed lifecycle records. Canonical event types are `blocker.opened`, `blocker.resolved`, `blocker.superseded`, and `blocker.reopened`. Each lifecycle event must include a stable `blockerFingerprint`; only a matching resolved or superseded event clears an opened blocker. Legacy `severity=blocking` events remain blocking audit history unless they are represented through the lifecycle taxonomy.

Use it for independent review outcomes that must block closeout, replay scorecards, and active eval fixtures:

```sh
node scripts/runtime-state.mjs record-eval-result \
  --run-id <runId> \
  --goal-id <goalId> \
  --suite completion-authority \
  --status failed \
  --regression-worsened true \
  --evidence-json '{"decision":"REJECT","findingCount":4}' \
  --json
```

Completion authority treats `regression_worsened=true` as blocking. The status read model exposes the latest eval under `compactStatus.latestEval` and surfaces worsened regressions through `compactStatus.currentBlocker`, so a resumed run can see the stop reason without replaying chat history.

The harness-control-plane golden eval gate is executable:

```sh
npm run test:eval
```

The command runs `tools/evals/harness-control-plane.mjs` against `tests/fixtures/harness-control-plane/golden-regression.json`. The fixture namespace covers completion false positives, stale verdicts, phase-status-only completion, missing identity, wrong tool selection, invalid schema rejection, out-of-scope writes, stale leases, degraded runtime capability, and eval worsening.

Low-score or failed traces can be converted into reviewed testcase candidates:

```sh
node tools/awtl/trace-to-testcase.mjs candidate \
  --trace-path <trace.json> \
  --out .moonshot-relay/eval-artifacts/harness-control-plane/candidate.json \
  --json
```

Candidate artifacts are generated evidence. They require review and rollback metadata before promotion into source fixtures.

## Memory Promotion Ledger

Long-term memory promotion is recorded in `runtime-state.sqlite` before any MemoryGraph or account-root memory write.
Promotion requires fresh evidence, reviewer approval, replay result, rollback plan, and scope owner.

```sh
node scripts/runtime-state.mjs record-memory-promotion \
  --run-id <runId> \
  --goal-id <goalId> \
  --memory-id <memoryId> \
  --status promoted \
  --evidence-json '<fresh evidence json>' \
  --reviewer-json '<approved review json>' \
  --replay-json '<passed replay json>' \
  --rollback-json '<rollback plan json>' \
  --scope-owner <owner> \
  --json
```

Missing inputs are recorded as rejected ledger decisions. Rollback preserves the audit row and supersedes the active promotion:

```sh
node scripts/runtime-state.mjs rollback-memory-promotion \
  --run-id <runId> \
  --goal-id <goalId> \
  --memory-id <memoryId> \
  --rollback-evidence-json '<rollback evidence json>' \
  --json
```

Stale promoted memory appears only as `compactStatus.staleWarnings` and `resumeBrief.memoryWarnings`.
Memory-derived facts cannot make `assess-completion` return `accepted`; only fresh verification-plane evidence can do that.

## Verification Plane

Completion evidence is written as structured verification-plane evidence before `assess-completion` can create an accepted DB decision.

```sh
node scripts/verification-plane.mjs record-summary \
  --run-id <runId> \
  --goal-id <goalId> \
  --profile runtime_adapter \
  --planes-json '[{"plane":"unit","status":"passed"}]' \
  --identity-json '{"runLeaseId":"<lease>"}' \
  --json
```

Verification profiles describe task-scope summary requirements. They do not lower whole-plan completion authority.

| Profile | `profileRequiredPlanes` | Accepted completion alone |
| --- | --- | --- |
| `prompt_only` | `quality` | no |
| `docs_only` | `package`, `quality` | no |
| `script_change` | `unit`, `quality` | no |
| `workflow_core` | `unit`, `package`, `installer`, `security`, `quality` | no |
| `runtime_adapter` | `unit`, `package`, `installer`, `browser`, `security`, `quality` | yes, when all blockers are absent |

`--required-planes-json` is a summary override only. The summary payload records both `profileRequiredPlanes` and `completionAuthorityRequiredPlanes`; `assess-completion` only accepts the canonical completion authority planes.

Accepted completion requires fresh `unit`, `package`, `installer`, `browser`, `security`, and `quality` plane evidence. Missing planes, stale evidence, failed planes, or security blockers keep `assess-completion` rejected or in `needs_more_evidence`.

Browser traces are normalized under `.moonshot-relay/browser-artifacts/<runId>/<goalId>/<flow>/trace-metadata.json`:

```sh
node scripts/verification-plane.mjs normalize-browser-trace \
  --run-id <runId> \
  --goal-id <goalId> \
  --url http://localhost:3000 \
  --flow smoke \
  --json
```

Playwright smoke and integration results are normalized into `BROWSER_COMPLETION_RESULT` evidence:

```sh
node scripts/verification-plane.mjs normalize-playwright-result \
  --run-id <runId> \
  --goal-id <goalId> \
  --scenario-id <scenarioId> \
  --scenario-json '<json>' \
  --result-json '<json>' \
  --json
```

The normalizer treats missing required artifacts as `artifact_missing`, critical console errors and 5xx or failed network responses as `playwright_assertion_failed`, and retries as `flaky_pass`. A `flaky_pass` or smoke-only result for a critical scenario is browser evidence, but it is not clean-finish evidence. Agentic browser confirmation can add evidence after Playwright, but cannot override failed Playwright assertions.

Agentic browser confirmation is normalized as a second browser evidence layer after Playwright:

```sh
node scripts/verification-plane.mjs normalize-browser-confirmation \
  --run-id <runId> \
  --goal-id <goalId> \
  --scenario-id <scenarioId> \
  --scenario-json '<json>' \
  --playwright-result-json '<json>' \
  --confirmation-json '<json>' \
  --json
```

The confirmation adapter may be `agent-browser`, `playwright-mcp`, or explicitly recorded local `browserctl` fallback evidence. It must report observed URL, expected text match, expected role/name affordance, screenshot, accessibility snapshot or equivalent structured snapshot, and console/network summary when available. Unsupported or unavailable backends are setup gaps; missing screenshots or snapshots are artifact failures; failed console/network summaries are browser confirmation failures. Adapter output cannot redefine the scenario expectations, cannot claim completion authority, and cannot turn failed, flaky, or setup-gap Playwright evidence into `clean_pass`.

Review-critique-loop evidence is required for browser/integration-required tasks, critical scenarios, phase closeout, and explicit completion claims:

```sh
node scripts/verification-plane.mjs record-summary \
  --run-id <runId> \
  --goal-id <goalId> \
  --planes-json '<json>' \
  --task-class-json '<json>' \
  --review-critique-loop-json '<REVIEW_CRITIQUE_LOOP_RECEIPT>' \
  --completion-claim true \
  --json
```

The receipt is a closed semantic evidence projection. It records exactly two review iterations, reviewer ids and foci, parent dispositions, candidate/source/bundle digests, and derived closeout eligibility. Raw prompts, transcripts, chat history, hidden reasoning, and self-evaluation are forbidden. A missing, mismatched, tampered, blocking, or non-eligible receipt makes `requiredChecksPassed=false`, so `assess-completion` remains rejected.

Repair-loop evidence must preserve the same `scenarioId`, failing assertion ids, artifact links, and the original rerun command. `maxRepairAttempts` defaults to `2` and cannot be raised by the prompt. Exhausted repair loops use `repair_exhausted` evidence and block clean completion until a tracked blocker or accepted fix exists.

Security evidence is assessed from CodeQL, dependency review, Dependabot, and secret scanning status:

```sh
node scripts/verification-plane.mjs assess-security \
  --run-id <runId> \
  --goal-id <goalId> \
  --scans-json '<json>' \
  --json
```

Missing scans, stale scans, high/critical findings, vulnerable dependency findings, and secret scanning findings are release blockers unless the evidence includes an owner-approved exception.

## Multi-Project And Multi-Run Identity

Runtime state is project-scoped by DB path and run-scoped by `runId + goalId`.

`prepare-phase-runner-state.mjs` accepts explicit identity controls:

- `--run-id <id>` for resume or externally managed session identity
- `--goal-id <id>` for the work item or phase-plan identity
- `--workspace-id <id>` for the active checkout/worktree identity
- `--allow-parallel` when the operator intentionally wants more than one active run for the same goal
- `--lease-ttl-ms <ms>` to tune the active run lease window for controlled tests or long-running phases

When `--run-id` is omitted, the prepare script generates a unique `phase-runner-<timestamp>-<uuid>` run ID. When `--workspace-id` is omitted, it stores a hash-derived workspace ID for the current checkout. Non-dry-run prepare records that identity in `runs.workspace_id` and writes a resume snapshot under the same run and goal.

By default, a second non-dry-run prepare with a different `runId` but the same `goalId` is blocked while an active run exists. Passing the same `--run-id` resumes the run; passing `--allow-parallel` records an explicit parallel-run lease. `scripts/runtime-state.mjs status --json` exposes active runs under `runtimeCapabilityStatus.activeRuns` and `compactStatus.activeRuns`.

Lease lifecycle commands:

```sh
node scripts/runtime-state.mjs heartbeat-run-lease \
  --run-id <runId> \
  --goal-id <goalId> \
  --lease-ttl-ms 1800000 \
  --json

node scripts/runtime-state.mjs cleanup-stale-leases --json
```

`status --json` exposes stale leases under `runtimeCapabilityStatus.staleRuns` and `compactStatus.staleRuns`; stale lease warnings are listed in `compactStatus.staleWarnings`. Acquiring a new run lease automatically recovers expired leases and records a `run_lease.stale_recovered` runtime event.
