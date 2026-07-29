---
name: moon-relay-kernel
description: Single public entrypoint for Moon Relay Kernel task routing and adaptive workflow execution.
---

# Moon Relay Kernel

1. Confirm the active project track is `kernel`; otherwise return `wrong_harness` without mutation.
2. Capture the objective, acceptance, constraints, and non-goals as a compact task contract; the host hands it to `kernel next` once, and the Kernel keeps it as the run's authority.
3. Drive the run with exactly two runtime commands: `kernel next` returns the objective, acceptance, constraints, non-goals, evidence, and the one action to take now; `kernel report --report-json <file>` submits a change summary, changed paths, risks, requested verifications, and structured judgments. The Host binds the run; do not make the model track its id.
4. Do the one work unit `next` returns and stay inside its allowed paths; echo its `stepId` (and `capsuleId`, when one was issued) in the report. A change outside the unit, or a report answering a different unit, is refused before any evidence runs.
5. Request verifications using the command refs `next` lists for each outstanding obligation; the Kernel runtime executes them itself and owns the resulting hard evidence. A command that is not bound to the obligation is rejected before it runs.
6. A protected or high-risk judgment (security review and anything auth, payment, migration, or data-loss shaped) is satisfied only by a review the Kernel itself recorded from an independent reviewer session; name that review's receipt id in the judgment instead of asserting a reviewer identity in the report.
7. Treat Kernel completion decisions as the only completion authority; a run is done only when `next` returns the `done` action, never from narration.
8. When blocked, report the blocker reason (question, permission, external-dependency, unsupported-verification, unsafe-command, network-policy) instead of improvising.
