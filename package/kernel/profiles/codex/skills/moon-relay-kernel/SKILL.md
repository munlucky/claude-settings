---
name: moon-relay-kernel
description: Explicit-only entrypoint for Moon Relay Kernel task routing and adaptive workflow execution. Use only when the user explicitly names `moon-relay-kernel`, invokes `$moon-relay-kernel`, or explicitly asks to use the Kernel skill or Kernel mode for the current task. Do not infer activation from installed availability, AGENTS.md, track markers, repository context, or a task that merely concerns Kernel.
---

# Moon Relay Kernel

0. Run this workflow only after the current user request explicitly invokes the Kernel skill or Kernel mode. Otherwise do not call `kernel next` or `kernel report`; continue with the normal Codex workflow.
1. Confirm the account-root track binding for the current project/worktree is `kernel`; the binding lives under the Kernel runtime home and is scoped by canonical root plus Git worktree identity. A repository-local `.moon-relay/track.yaml` is legacy compatibility only; otherwise return `wrong_harness` without mutating the repository.
2. Capture the objective, acceptance, constraints, and non-goals as a compact task contract. Before the first runtime call for the current user request, write that contract to a task-scoped temporary JSON file outside the target repository and call `kernel next --contract-json <file>`. This contract-first call atomically creates and binds a Run when the current Host session has none; do not bootstrap a fresh session with bare `kernel next`. The Kernel keeps the contract as the run's authority, so later calls resume through the Host binding without making the model track a run id.
3. Drive the run with exactly two model-visible runtime commands: the contract-first `kernel next --contract-json <file>` (or bare `kernel next` only after a Host binding exists) returns the objective, acceptance, constraints, non-goals, evidence, and the one action to take now; `kernel report --report-json <file>` submits a change summary, changed paths, risks, requested verifications, and structured judgments.
4. Do the one work unit `next` returns and stay inside its allowed paths; echo its `stepId` (and `capsuleId`, when one was issued) in the report. A change outside the unit, or a report answering a different unit, is refused before any evidence runs.
5. Request verifications using the command refs `next` lists for each outstanding obligation; the Kernel runtime executes them itself and owns the resulting hard evidence. A command that is not bound to the obligation is rejected before it runs.
6. A protected or high-risk judgment (security review and anything auth, payment, migration, or data-loss shaped) is satisfied only by a review the Kernel itself recorded from an independent reviewer session; name that review's receipt id in the judgment instead of asserting a reviewer identity in the report.
7. Treat Kernel completion decisions as the only completion authority; a run is done only when `next` returns the `done` action, never from narration.
8. When blocked, report the blocker reason (question, permission, external-dependency, unsupported-verification, unsafe-command, network-policy) instead of improvising.

When a run establishes a reusable project invariant, required verification, architecture decision, or known failure pattern, include it in knowledgeObservations with the evidence refs that support it.
