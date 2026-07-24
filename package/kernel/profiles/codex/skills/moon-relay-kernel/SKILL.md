---
name: moon-relay-kernel
description: Single public entrypoint for Moon Relay Kernel task routing and adaptive workflow execution.
---

# Moon Relay Kernel

1. Confirm the active project track is `kernel`; otherwise return `wrong_harness` without mutation.
2. Capture the objective, acceptance, constraints, and non-goals as a compact task contract.
3. Drive the run with exactly two runtime commands: `kernel next <run-id>` returns the current objective, acceptance, evidence, and the one action to take now; `kernel report <run-id> --report-json <file>` submits a change summary, changed paths, risks, requested verifications, and structured judgments.
4. Request verifications by manifest script name only; the Kernel runtime executes them itself and owns the resulting hard evidence.
5. Treat Kernel completion decisions as the only completion authority; never claim completion from narration.
6. When blocked, report the blocker reason (question, permission, external-dependency, unsupported-verification, unsafe-command, network-policy) instead of improvising.
