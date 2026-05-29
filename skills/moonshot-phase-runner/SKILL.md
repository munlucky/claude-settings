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

Own the public control-plane entrypoint for phase-based work. Resolve the active plan directory, validate the package, seed or reconcile `phase-status.yaml`, choose the execution route from `.claude/workflow.registry.yaml`, and keep the run moving until the full plan directory is complete or a concrete blocker is recorded.

## Hard Stops

- Do not treat a completed phase as plan completion while `phase-status.yaml` still has actionable phases.
- Do not write live `.claude/**` or `.codex/**` adoption targets from staged redesign phases. Phase 08 owns controlled adoption.
- Do not use `agent-loop.mjs` as the primary interactive control plane. It is a delegated-terminal/headless fallback adapter.
- Do not return final success until `phase-closeout-finalize.mjs` and final repository closeout gates agree.

## Inputs

- Optional plan directory argument.
- Optional master plan path inside the plan directory.
- Active status file: `.claude/docs/phase-status.yaml`.
- Registry: `.claude/workflow.registry.yaml`.
- Execution artifacts: `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `SCORECARD.md`, `HANDOFF.md`, attempt manifest, and verifier verdict.

## Flow

1. Resolve the active plan directory and active phase from `phase-status.yaml`.
2. Validate master plan, root phase docs, and execution root consistency.
3. Build a compact phase-attempt brief from the active phase contract.
4. In interactive runs, coordinate from the current session and delegate each phase attempt/review to a fresh forked agent.
5. Use deterministic scripts only for validation, state reads, finalization, and fallback/headless execution.
6. After each phase, collect diff/evidence in the parent session and run closeout gates.
7. Continue to the next actionable phase until the whole plan directory is done.

## Required Evidence

- Plan resolution and active phase source.
- Execution mode and fallback mode from registry.
- Runtime capability evidence when a tool/fork/browser path is missing.
- Review evidence for code-changing phases.
- Fresh verifier verdict and scorecard agreement.
- Finalizer output and phase closeout gate result.
- Enforce Final Git Closeout evidence before any whole-plan success return.

## References

- `references/control-plane.md`: state authority, phase discovery, and parent evidence collection.
- `references/execution-modes.md`: forked-agent primary path and delegated-terminal fallback boundary.
- `references/closeout-gates.md`: review, verification, finalizer, and repository closeout rules.

## Project Knowledge Context Contract

Before creating any phase attempt prompt, call the staged `knowledge-context-build.mjs` helper with `stage=execute` and attach only `projectKnowledgeContext.promptBlock` plus status-only metadata.

Required metadata surface:
- `status`, `strictness`, `stage`, `blocking`, `unavailableCount`, and `knowledgeRevision`.
- Do not put raw MemoryGraph records, KG edges, ontology dumps, logs, transcripts, or secret-like strings into phase prompts, attempt manifests, workflow evidence, QA reports, scorecards, or handoffs.
- Helper unavailable in advisory mode degrades to `status=degraded_read` and continues. Helper unavailable in strict memory mode is represented as blocking metadata before dispatch.
