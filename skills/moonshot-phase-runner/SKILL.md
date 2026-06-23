---
name: moonshot-phase-runner
description: Use for large, phase-based, or long-running implementation work that should run from a prepared plan package.
triggers:
  - "phase runner"
  - "run phase"
  - "execute phase"
  - "agent loop"
deepReferences:
  - references/control-plane.md
  - references/execution-modes.md
  - references/closeout-gates.md
---

# Moonshot Phase Runner

## Role

Own the public control-plane entrypoint for phase-based work. Resolve the active plan directory, validate the package, seed or reconcile `phase-status.yaml`, choose the in-session/forked-agent execution route, and keep the run moving until the full plan directory is complete or a concrete blocker is recorded.

## Hard Stops

- Treat a general start request such as "작업시작", "start work", "run this plan", or a plan directory plus master plan as full-plan execution intent. Do not narrow it to Phase 01, a waiver phase, or a preparation slice unless the operator explicitly says a single phase only, for example "Phase 01만" or "only phase 01".
- Do not treat a completed phase as plan completion while `phase-status.yaml` still has actionable phases.
- Do not treat `phase-status.yaml`, verifier JSON, QA report, scorecard, handoff, or child chat output as clean-finish authority when runtime-state completion authority is available. Use `scripts/runtime-state.mjs assess-completion` and require an accepted DB decision.
- Treat `runtime-state.sqlite` as the authority for blocker state, resume reconstruction, run status, and whole-plan completion decisions; `phase-status.yaml` is only a phase cursor projection.
- Do not execute a phase plan derived from an architecture package when selected ADRs, traceability rows, owners, or verification signals are missing from the phase metadata.
- Do not dispatch a phase with `architecture.required=true` when `ARCHITECTURE_HANDOFF.json` is missing, blocked, or lacks selected verification signals.
- Do not stop the whole plan just because a completed phase produced review findings, failed eval evidence, or a non-accepted completion decision. Record the blocker as carry-forward evidence, keep the final completion gate closed, and continue the next actionable independent phase.
- Do not assume phases are parallelizable from prose alone. Parallel execution requires validated plan graph metadata with dependencies satisfied and non-overlapping write sets.
- Do not write live `.claude/**` or `.codex/**` adoption targets from staged redesign phases. Phase 08 owns controlled adoption.
- Do not use `agent-loop.mjs`, `moonshot-phase-dispatch.mjs`, or delegated-terminal adapters as the default execution path. They are legacy/headless compatibility adapters only.
- Do not return final success until the in-session coordinator, fresh verifier evidence, scorecard, and repository closeout evidence agree.

## Inputs

- Optional plan directory argument.
- Optional master plan path inside the plan directory.
- Optional run identity arguments: `--run-id`, `--goal-id`, `--workspace-id`.
- Optional `--allow-parallel` only when the operator intentionally wants more than one active run for the same goal.
- Optional `--lease-ttl-ms` for controlled lease windows; long phases should heartbeat instead of relying on stale active leases.
- Active status file: `.moonshot-relay/docs/phase-status.yaml`, used as a phase cursor projection only.
- Execution route: `in-session-coordinator` by default. `delegated-terminal` is legacy compatibility only and requires an explicit legacy maintenance reason.
- Execution artifacts: `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `SCORECARD.md`, `HANDOFF.md`, attempt manifest, and verifier verdict.

## Flow

1. Resolve the active plan directory and active phase from `phase-status.yaml`.
2. Validate master plan, root phase docs, and execution root consistency.
2.1. If plan graph metadata is present, validate it before dispatch; if it is absent, continue in markdown-compatible sequential mode and do not infer parallelism.
3. Prepare or resume a run with explicit `runId + goalId + workspaceId`; generate a unique run ID only when one was not provided.
4. If another active run already owns the same goal, block by default unless `--allow-parallel` was explicitly requested.
5. Treat expired leases as stale, recover them through runtime-state, and surface `compactStatus.staleWarnings` in the phase handoff instead of hiding old active runs.
6. Heartbeat long-running phases with `scripts/runtime-state.mjs heartbeat-run-lease` before the lease window expires.
7. Check protected paths and approval-required operations through `tools/sandbox/policy.mjs check --json` before executing sandbox-sensitive tool calls.
8. Build a compact phase-attempt brief from the active phase contract.
8.1. Include declared read-only paths and owned/write-set paths in the phase-attempt brief; changed files outside that write set must be recorded as scope drift.
9. For architecture-derived plans, attach only selected ADR, traceability, owner, verification signal, and architecture review paths needed by the active phase.
10. When phase metadata includes `architecture.handoff`, require `status=ready`, attach only `ARCHITECTURE_HANDOFF.promptBlock` plus compact metadata, and reject blocked handoff dispatch.
11. In interactive runs, coordinate from the current session and delegate each phase attempt/review to a fresh forked agent.
12. Use deterministic scripts only for support checks that are still installed in the runtime payload. Do not auto-start legacy delegated-terminal adapters.
13. After each phase, collect diff/evidence in the parent session and run coordinator closeout gates.
14. If a phase completes with phase-local closeout evidence, reconcile runner state so the next incomplete phase becomes active before reporting status.
15. If closeout gates reject a phase after useful implementation evidence was produced, record the rejection with `record-eval-result --regression-worsened true` or a blocking runtime event, keep the finding in carry-forward state, and continue to the next independent actionable phase.
16. Continue to the next actionable phase until the whole plan directory is implemented. Only the final whole-plan completion claim requires `assess-completion` to return `accepted`.

## Required Evidence

- Plan resolution and active phase source.
- Execution mode and any explicit legacy fallback reason.
- Runtime capability evidence when a tool/fork/browser path is missing.
- Review evidence for code-changing phases.
- Plan graph validation evidence or explicit markdown-compatible mode evidence.
- Fresh verifier verdict and scorecard agreement.
- Coordinator closeout evidence and phase closeout result.
- Enforce Final Git Closeout evidence before any whole-plan success return.

## References

- `references/control-plane.md`: state authority, phase discovery, and parent evidence collection.
- `references/execution-modes.md`: forked-agent primary path and legacy delegated-terminal boundary.
- `references/closeout-gates.md`: review, verification, finalizer, and repository closeout rules.

## Project Knowledge Context Contract

Before creating any phase attempt prompt, call the staged `knowledge-context-build.mjs` helper with `stage=execute` and attach only `projectKnowledgeContext.promptBlock` plus status-only metadata.

Required metadata surface:
- `status`, `strictness`, `stage`, `blocking`, `unavailableCount`, and `knowledgeRevision`.
- Do not put raw MemoryGraph records, KG edges, ontology dumps, logs, transcripts, or secret-like strings into phase prompts, attempt manifests, workflow evidence, QA reports, scorecards, or handoffs.
- Helper unavailable in advisory mode degrades to `status=degraded_read` and continues. Helper unavailable in strict memory mode is represented as blocking metadata before dispatch.
