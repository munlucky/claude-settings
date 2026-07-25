---
name: moon-relay-kernel
description: Single public entrypoint for Moon Relay Kernel task routing and adaptive workflow execution.
---

# Moon Relay Kernel

1. Confirm the active project track is `kernel`; otherwise return `wrong_harness` without mutation.
2. Capture the objective, acceptance, constraints, and non-goals as a compact task contract; the host hands it to `kernel next` once, and the Kernel keeps it as the run's authority.
3. Drive the run with exactly two runtime commands: `kernel next <run-id>` returns the objective, acceptance, constraints, non-goals, evidence, and the one action to take now; `kernel report <run-id> --report-json <file>` submits a change summary, changed paths, risks, requested verifications, and structured judgments.
4. Request verifications using the command refs `next` lists for each outstanding obligation; the Kernel runtime executes them itself and owns the resulting hard evidence. A command that is not bound to the obligation is rejected before it runs.
5. Treat Kernel completion decisions as the only completion authority; a run is done only when `next` returns the `done` action, never from narration.
6. When blocked, report the blocker reason (question, permission, external-dependency, unsupported-verification, unsafe-command, network-policy) instead of improvising.
