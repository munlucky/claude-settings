# External Skill Pattern Transfer

Canonical source guideline for evaluating external harness or skill patterns without wholesale adoption.

Extract reusable mechanics, not files, prompts, or branding from an external harness.
Map each accepted pattern to an existing owner skill, script, template, or public guideline before adding a new surface.
Reject patterns that duplicate existing behavior, weaken verification, or depend on unavailable runtimes.
Record the source, accepted deltas, rejected deltas, and verification evidence in the task handoff.

## Accepted Patterns

- Testing discipline: convert observed harness failures into active regression tests before changing shared behavior.
- Ledger: record durable runtime decisions and evidence in a structured state plane instead of relying on chat memory.
- Local edit discipline: map each imported idea to an existing owner and keep changes scoped to that owner.
- Loop cap: bound retry and review loops with explicit blocker or handoff states.
- Sandbox and lifecycle control: record sandbox boundaries, approval-required operations, and recovery lifecycle evidence.

## Rejected Patterns

- Public skill sprawl: do not add a new public skill when an existing entrypoint can own the behavior.
- AGENTS.md knowledge hoarding: keep always-loaded profile context short and move durable detail to canonical docs.
- Default multi-agent fanout: use independent agents only where review or work partitioning has a concrete contract.
