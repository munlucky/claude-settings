---
name: moon-relay-kernel
description: Default Codex command-skill entrypoint for Moon Relay Kernel task routing and adaptive workflow execution. Selecting this skill activates Kernel workflow for that task; it does not force unselected ordinary Codex tasks into Kernel.
---

# Moon Relay Kernel

## Goal
The account command skillset defaults to Kernel. Bind the current project/worktree to Moon Relay Kernel, execute assigned bounded work units, and drive the task to authoritative Kernel completion with verified proof and receipts; for a non-kernel track return `wrong_harness` without mutating the repository.

## Context
- **Binding Scope**: `Project → Worktree → Run`, scoped by canonical root and Git worktree identity under runtime home `~/.moon-relay-kernel`.
- **Two Core Commands**:
  - `kernel next [--contract-json <file>]` (or MCP `kernel_next`): Returns objective, acceptance, constraints, context capsule, and the active work unit.
  - `kernel report [--report-json <file>]` (or MCP `kernel_report`): Submits change summary, changed paths, risks, and requested verifications.
- **Task Contract**: Captured as compact JSON (objective, acceptance, constraints, non-goals) passed via `kernel next --contract-json <file>` on the first call to atomically create/bind the Run; do not bootstrap a fresh session with bare `kernel next` (use bare `kernel next` only after a Host binding exists).

## Autonomy & Priorities
- **Implementation Autonomy**: Perform code edits, testing, and commands directly in the native owner session and stay inside its allowed paths returned by `next`.
- **Mutation Boundary**: Never mutate files outside `allowedPaths`. Mutations outside the allowed unit are rejected before verification runs.
- **Delegation**: Subagents are optional for genuinely partitioned tasks; they are never a prerequisite for ordinary implementation.
- **Fast Blockers**: When blocked, immediately report the blocker reason (`question`, `permission`, `unsupported-verification`, etc.) rather than looping or improvising.

## Definition of Done
- Treat Kernel completion decisions as the only completion authority; a run is done only when `kernel next` returns `{ action: { type: "done" } }`. Narration or plain text completion claims have zero authority.
- Reusable invariants, required verifications, architecture decisions, and failure patterns are recorded in `knowledgeObservations` upon completion.

## Verification
- Request verifications using the command refs `next` lists for each outstanding obligation; the Kernel runtime executes them and owns the resulting evidence receipts.
- For independent review actions (security review, protected T3 obligations, explicit flags), satisfy them via trusted review receipts recorded from an independent reviewer session (or native subagent fallback).
- Follow a single linear verification sequence: Bounded Impact Test → Build/Typecheck → Regression Gate → Final Report.
