---
name: moon-relay-kernel
description: Default Codex command-skill entrypoint for Moon Relay Kernel task routing and adaptive workflow execution. Selecting this skill activates Kernel workflow for that task; it does not force unselected ordinary Codex tasks into Kernel.
---

# Moon Relay Kernel

0. The account command skillset defaults to Kernel. Run this workflow when `moon-relay-kernel` is selected by the native command/skillset, explicitly invoked, or the active project track resolves to `kernel`. Confirm the track before calling `kernel next` or `kernel report` (or MCP tools `kernel_next` / `kernel_report`); for a non-kernel track return `wrong_harness` without mutating the repository.
1. Confirm the account-root track binding for the current project/worktree is `kernel`; the binding lives under the Kernel runtime home and is scoped by canonical root plus Git worktree identity (`Project → Worktree → Run`).
2. Capture the objective, acceptance, constraints, and non-goals as a compact task contract. Before the first runtime call for the current user request, write that contract to a task-scoped temporary JSON file outside the target repository and call `kernel next --contract-json <file>` (or MCP tool `kernel_next` with `contractJson`). This contract-first call atomically creates and binds a Run when the current worktree has none; do not bootstrap a fresh session with bare `kernel next` (use bare `kernel next` only after a Host binding exists). The Kernel keeps the contract as the Run's authority, so later calls resume through the worktree lease.
3. Drive the run with exactly two core runtime interactions:
   - `kernel next --contract-json <file>` (or bare `kernel next` / MCP `kernel_next` once active) returns the objective, acceptance, constraints, non-goals, evidence, context capsule, and the one action/work unit to execute now.
   - `kernel report --report-json <file>` (or MCP `kernel_report`) submits a change summary, changed paths, risks, requested verifications, and structured judgments.
4. Perform the assigned bounded work unit directly in the native surface (file editing, testing, command execution, or native subagents if supported) and stay inside its allowed paths returned by `next`. Echo the work unit's `stepId` (and `capsuleId`, when issued) in the report. A mutation outside the allowed unit is refused before any verification runs.
5. Request verifications using the command refs `next` lists for each outstanding obligation; the Kernel runtime executes them and owns the resulting evidence receipts. A command not bound to the obligation is rejected before it runs.
6. When the contract specifies `independentReviewRequired=true`, satisfy it with a review receipt recorded from an independent reviewer session; ordinary tasks do not require an independent reviewer or subagent.
7. Treat Kernel completion decisions as the only completion authority; a run is done only when `next` returns the `done` action, never from narration.
8. When blocked, report the blocker reason (question, permission, external-dependency, unsupported-verification, unsafe-command, network-policy) instead of improvising.

When a run establishes a reusable project invariant, required verification, architecture decision, or known failure pattern, include it in knowledgeObservations with the evidence refs that support it.
