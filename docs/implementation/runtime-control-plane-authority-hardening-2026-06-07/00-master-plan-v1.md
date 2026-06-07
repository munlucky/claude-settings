# Runtime Control Plane Authority Hardening - Master Plan v1

## Status

Status: execution-ready-after-review-loop

This plan hardens the existing Moonshot Relay runtime control plane so workflow state, blockers, verification evidence, and completion claims are reconstructable from `runtime-state.sqlite`. It is a focused hardening package, not a replacement for `docs/public/roadmaps/harness-control-plane-modernization`.

## Objective

Make `runtime-state.sqlite` the single workflow authority while keeping markdown reports, `phase-status.yaml`, verifier JSON, QA reports, scorecards, handoffs, and chat output as derived projections only.

## Non-Negotiables

- Phase closeout and whole-plan closeout are different gates.
- Phase closeout records phase-local pass, failure, or carry-forward blocker evidence.
- Only whole-plan final success can require and use `scripts/runtime-state.mjs assess-completion` with an accepted DB decision.
- Verification profiles can classify task-scope evidence, but they must not weaken completion authority.
- Live account-root mutation is out of scope unless the user explicitly approves a controlled adoption phase.
- Raw MemoryGraph, KG, ontology, logs, transcripts, sqlite files, verdict JSON, browser artifacts, and account-root state are not source payloads.

## Phase Map

| Phase | Document | Dependencies | Primary outcome |
| --- | --- | --- | --- |
| 01 | `01-authority-matrix-and-closeout-model-v1.md` | none | Workflow path to DB authority matrix and closeout semantics are fixed. |
| 02 | `02-start-resume-identity-taxonomy-v1.md` | 01 | Start/resume events, run identity, and metrics event names are deterministic. |
| 03 | `03-blocker-lifecycle-read-model-v1.md` | 01, 02 | Blocking events gain an event-backed resolution lifecycle and read-model behavior. |
| 04 | `04-verification-profile-and-completion-authority-v1.md` | 01, 03 | Task evidence profiles are separated from accepted completion authority. |
| 05 | `05-commit-closeout-event-ledger-v1.md` | 01, 02 | `commit-moonshot` memory/audit/staging/commit outcomes are runtime events. |
| 06 | `06-package-smoke-and-adoption-boundary-v1.md` | 01-05 | Dry-run, package smoke, temp-home smoke, and live adoption are separated. |

## Authority Matrix Contract

Every implementation phase must preserve this matrix shape and complete any missing row-level behavior:

| Workflow path | DB table | event_type/status | Writer CLI | Required identity | Closeout effect | Projection output |
| --- | --- | --- | --- | --- | --- | --- |
| phase start | `runs`, `goals`, `runtime_events` | `phase.start` | `prepare-phase-runner-state.mjs` | `runId`, `goalId`, `workspaceId`, `phaseId` | opens phase scope only | phase status/read model |
| resume success | `resume_snapshots`, `runtime_events` | `resume.success` | `prepare-phase-runner-state.mjs` or `runtime-state.mjs snapshot-resume` | same run/goal | restores context and may clear resume blocker | `resumeBrief` |
| resume failure | `runtime_events` | `resume.failure` | `runtime-state.mjs record-event` | same run/goal | blocks or warns current phase | `currentBlocker` |
| blocker lifecycle | `runtime_events` | `blocker.opened/resolved/superseded/reopened` | `runtime-state.mjs record-event` | same run/goal plus blocker fingerprint | phase blocker lifecycle | stale/current blocker projection |
| phase closeout | `runtime_events`, `eval_results` | `phase.closeout.passed/failed/carry_forward` | phase runner/executor via runtime-state | same run/goal plus `phaseId` | phase-local only | handoff, scorecard, status projection |
| whole-plan closeout | `completion_decisions` | `accepted/rejected/needs_more_evidence` | `runtime-state.mjs assess-completion` | same run/goal plus evidence identity | only accepted final claim | `compactStatus.latestVerdict` |
| verification evidence | `runtime_events`, `eval_results` | `verification.evidence`, verification-plane eval | `verification-plane.mjs record-summary` | same run/goal plus evidence identity | supports completion assessment only | verifier summary |
| commit closeout | `runtime_events`, optional `memory_promotion_decisions` | commit event taxonomy | commit-moonshot helpers | active run/goal or audit-only identity | no completion authority | commit summary/audit log |

## Acceptance Criteria

- `npm test` remains the default active gate.
- `status --json` can explain active run identity, current blocker, next action, latest eval, latest verdict, stale warnings, and operational metrics for the covered workflow paths.
- A phase can close locally without accepted whole-plan completion, but final whole-plan success cannot.
- `docs_only` and `prompt_only` verification profiles can record evidence summaries but cannot produce accepted completion without the canonical completion authority planes.
- Package dry-run, package materialization smoke, installer dry-run, and temp-home install smoke are distinct evidence types.
- Live account-root smoke is documented as approval-only and never part of default automated gates.

## Final Validation

Required after implementation:

- `npm test`
- `npm run test:package`
- `npm run test:eval`
- `node package/build-package.mjs --runtime all --dry-run --json`
- temp package materialization smoke from `package/build-package.mjs --runtime all --out <temp> --clean --json`
- temp account-root install smoke with explicit temp `MOONSHOT_RELAY_HOME`, `CLAUDE_HOME`, and `CODEX_HOME`
- `git diff --check`

## Review Loop

First-pass independent reviews were split by architecture, verification, and packaging/adoption. Separate improvement agents incorporated accepted recommendations. Remaining review artifacts live under `planning-loop/`.
