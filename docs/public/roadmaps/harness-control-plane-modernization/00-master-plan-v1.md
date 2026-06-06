# Moonshot Relay Harness Control Plane Modernization - Master Plan v1

## Scope Status

Status: foundation-candidate-partial-implementation-plan

This v1 package is retained as the Wave 1 foundation plan and implementation trace. It is not the final full-source modernization plan. The full source scope from the uploaded reports is carried forward in `00-master-plan-v2.md`; v1 must not be used to claim completion of Context State Engine, Tool Registry/Dispatcher, Sandbox Compute Plane, full Eval Regression Gate, trace-to-testcase loop, prompt assembly/caching, memory promotion, observability, branch protection operations, or installed native dependency availability.

## Objective

Upgrade Moonshot Relay from a document/profile-driven harness into a runtime control-plane harness with authoritative state, compact resumable context, bounded tool and sandbox surfaces, regression evals, CI/security gates, and account-root rollout discipline.

This plan intentionally keeps the full scope from the three source plans:

- Runtime Control Plane backed by `runtime-state.sqlite`
- Completion authority cutover from derived artifacts to DB decisions
- Context State Engine with compaction, rehydration, and prompt caching boundaries
- Tool Registry / Lazy Schema Loading and Sandbox Boundary
- Eval Regression Gate, trace-to-testcase improvement loop, and observability
- CI, CodeQL, Dependabot, CODEOWNERS, and branch protection documentation
- Packaging, installer, account-root, and downstream adoption verification

## Source Inputs

- `C:\Users\moon\Downloads\moonshot-relay 적용 및 고도화 작업계획1.md`
- `C:\Users\moon\Downloads\moonshot-relay 적용 및 고도화 작업계획2.md`
- `C:\Users\moon\.codex\attachments\03cce362-2a12-4d75-8baa-6312a6a32764\pasted-text.txt`
- Current source truth in `C:\dev\moonshot-relay`

## Current Baseline

- Public entrypoints remain stable: `product-orchestrator`, `moonshot-orchestrator`, `moonshot-phase-runner`.
- Canonical source is tracked root-level harness source: `skills/`, `agents/`, `rules/`, `bin/`, `tools/`, `schemas/`, `templates/`, `tests/`, `docs/public/`, and allowlisted `scripts/`.
- `.claude/`, `.codex/`, `.moonshot-relay/`, `.moonshot-state/`, sqlite files, verdict JSON, traces, caches, and browser artifacts are generated/runtime state.
- This plan package is tracked under `docs/public/roadmaps/harness-control-plane-modernization/`.
- Existing active gate is `npm test`; package and installer validation are also required for harness changes.

## Design Principles

- Completion is a runtime decision, not a chat claim or generated markdown artifact.
- Runtime Control Plane is authoritative; derived artifacts remain compatibility projections.
- Compute Plane is disposable; evidence is promoted only through explicit gates.
- New public skills are not added by default. External harness lessons are transferred into existing owners.
- Every structural harness behavior change starts with an executable regression contract.
- Account-root installation and downstream sync are controlled rollout phases, not incidental side effects.
- Native runtime dependencies are release-surface decisions. A dependency is not accepted until source, package materialization, account-root install, temp-home installer dry-run, and CI matrix execution are proven.
- Unauthorized approval-required operations are blocking runtime facts, not advisory notes.

## Protected Runtime Boundaries

Every phase must preserve these paths unless that phase explicitly owns a dry-run or controlled adoption step:

- `.claude/**`
- `.codex/**`
- `.moonshot-relay/**`
- `.moonshot-state/**`
- project-local logs, traces, caches, task docs, verdicts, DB files, and browser artifacts
- account-root homes outside a phase-owned temp home

Runtime/generated state can be read as compatibility evidence, but cannot be promoted into tracked source or package payloads.

## Phase Map

| Phase | Title | Primary Outcome | Dependencies |
|---|---|---|---|
| 01 | Baseline, Source Truth, and Adoption Boundary | Current source, metrics, and ownership are frozen | none |
| 02 | Runtime Control Plane Foundation | SQLite DB, migrations, events, completion decisions, snapshots | 01 |
| 03 | Completion Authority and Derived Artifacts | Clean finish requires accepted DB decision | 02 |
| 04 | Context State Engine and Prompt Assembly | Resume briefs, compaction, stable/dynamic prompt split | 02, 03 |
| 05 | Tool Registry, Lazy Schema, and Sandbox Boundary | Tool surface and approval/sandbox policy are enforceable | 02, 04 |
| 06 | Eval Regression, Trace, and Improvement Loop | Golden regression suites and trace-to-testcase loop exist | 02, 03, 05 |
| 07 | CI, Security, and Branch Protection | GitHub CI/security source config and required-check docs exist | 02, 06 |
| 08 | Packaging, Account-Root Rollout, and Downstream Adoption | Package/install parity and staged rollout are verified | 02-07 |

## Cross-Phase Interfaces

### Dependency Delivery Strategy

`better-sqlite3` is adopted as a root runtime dependency only when Phase 02 proves the delivery path end to end:

- `package.json` and `package-lock.json` are the source dependency authority.
- Source commands run after `npm ci`; no copied standalone script may assume undeclared native modules.
- Package/account-root materialization must either install the runtime dependency set under the materialized `MOONSHOT_RELAY_HOME` support root or fail with a typed degraded status before claiming runtime-state support.
- CI must exercise Windows, Linux, and macOS on the supported Node matrix before native dependency rollout is accepted.
- Account-root smoke must use temp `--moonshot-home`, `--claude-home`, and `--codex-home` values; live profile mutation is forbidden during CI and package tests.

### Runtime State CLI

`scripts/runtime-state.mjs` must provide:

- `init --json`
- `status --run-id <id> --goal-id <id> --json`
- `record-event --run-id <id> --goal-id <id> --event-type <type> --payload-json <json> --json`
- `record-completion --run-id <id> --goal-id <id> --status <rejected|needs_more_evidence> --reason <text> --evidence-json <json> --identity-json <json> --json`
- `assess-completion --run-id <id> --goal-id <id> --json`
- `acquire-run-lease --run-id <id> --goal-id <id> --workspace-id <id> [--allow-parallel true] --json`
- `supersede-completion --decision-id <id> --reason <text> --json`
- `snapshot-resume --run-id <id> --goal-id <id> --status-json <json> --resume-brief-json <json> --json`

Accepted completion decisions are normally written only by `assess-completion` after evidence validation. Manual accepted decisions require an explicit repair mode, writer identity, evidence hash, and approval ID; otherwise they are downgraded to `needs_more_evidence`.

Phase-runner preparation must also support `--run-id`, `--goal-id`, `--workspace-id`, and `--allow-parallel`. Omitted run IDs are generated per prepare invocation. Omitted workspace IDs are derived from the current checkout path. A different active run for the same goal blocks by default unless parallel execution is explicit.

### Runtime State Store API

`scripts/lib/runtime-state-store.mjs` must export:

- `initRuntimeState`
- `recordRuntimeEvent`
- `recordCompletionDecision`
- `assessCompletionAuthority`
- `recordResumeSnapshot`
- `recordToolCall`
- `recordEvalResult`
- `buildRuntimeStatusReadModel`

### Runtime Status Read Model

`buildRuntimeStatusReadModel()` must satisfy `schemas/verification.contract.yaml` `observability.runtimeStatusReadModel.requiredFields`:

- `runtimeCapabilityStatus`
- `runtimeCapabilityStatus.activeRuns`
- `compactStatus.activeContract`
- `compactStatus.activeRuns`
- `compactStatus.latestVerdict`
- `compactStatus.currentBlocker`
- `compactStatus.lineage`
- `compactStatus.staleWarnings`
- `resumeBrief.nextAction`
- `resumeBrief.currentBlocker`
- `resumeBrief.lineage`

### SQLite Schema v1

Required tables:

- `schema_migrations(version, name, applied_at)`
- `runs(run_id, workspace_id, started_at, ended_at, status, identity_json)`
- `goals(goal_id, run_id, objective_hash, status, created_at, updated_at)`
- `runtime_events(event_id, run_id, goal_id, event_sequence, event_type, severity, payload_json, created_at)`
- `completion_decisions(decision_id, run_id, goal_id, decision_sequence, status, reason, evidence_json, evidence_hash, identity_json, writer, supersedes_decision_id, revoked_at, created_at)`
- `resume_snapshots(snapshot_id, run_id, goal_id, snapshot_sequence, status_json, resume_brief_json, created_at)`
- `tool_calls(tool_call_id, run_id, goal_id, event_id, tool_group, tool_name, status, schema_mode, approval_required, payload_json, created_at)`
- `eval_results(eval_id, run_id, goal_id, suite, status, score_json, regression_worsened, evidence_json, created_at)`

Required constraints and indexes:

- `completion_decisions.status` is constrained to `accepted`, `rejected`, `needs_more_evidence`, `superseded`, or `revoked`.
- Decision/event/snapshot sequence values are monotonic within a run.
- Latest active completion is selected by sequence and `created_at`, excluding superseded and revoked decisions.
- Indexes exist for `(run_id, goal_id, created_at)`, latest completion lookup, blocking event lookup, and eval regression lookup.

## Acceptance Criteria

- `runtime-state.sqlite` is initialized only through `resolveDbPath()`.
- SQLite WAL and `busy_timeout=5000` are applied during init/open.
- `completion_decisions.status = accepted` is the only clean-finish authority.
- Phase status, verdict JSON, QA report, scorecard, and handoff remain readable and projectable, but cannot override DB authority.
- Derived projections include `authoritySource`, `decisionId`, `evidenceHash`, and `stale` metadata.
- `prepare-phase-runner-state.mjs --dry-run` remains non-mutating; non-dry-run records a resume snapshot.
- Tool registry decisions record selected/skipped components and schema mode.
- Unauthorized approval-required operations are documented, represented as blocking runtime events, and consumed by completion authority.
- Eval regression includes completion false-positive, stale verdict, wrong-tool, and out-of-scope write cases.
- New modernization regression tests are added to the active `npm test` command; `tests/package-layout.test.mjs` asserts those tests remain in the default gate.
- CI/security source config exists and required branch checks are documented.
- Package materialization includes support source scripts and excludes generated runtime DB/artifacts.
- CI matrix covers `windows-latest`, `ubuntu-latest`, and `macos-latest` on supported Node versions before native dependency rollout.
- Final validation passes:
  - `npm test`
  - `npm run test:package`
  - `node package/build-package.mjs --runtime all --dry-run --json`
  - `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json`
  - `git diff --check`

## Independent Review Loop

First-pass review uses three independent perspectives:

- Runtime architecture and state authority
- Workflow/product adoption and phase dependency integrity
- Verification, security, and CI regression risk

Review artifacts live under `planning-loop/`. Parent session owns all final edits.

## Readiness Status

Status: superseded-foundation-trace

This former readiness statement applies only to the Wave 1 foundation slice captured by v1. It is superseded by `00-master-plan-v2.md` for full modernization execution. v1 must not be used as the final execution-ready plan package.
