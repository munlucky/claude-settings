# Phase Runner Execution Modes

- `forked-agent` is the primary interactive phase-attempt mode when sub-agents are available.
- `delegated-terminal` remains the fallback for headless, cron, or no-subagent environments.
- `agent-loop.mjs` is an adapter, not a policy owner. It may continue a phase loop only when the selected execution mode explicitly routes there.
- Scripts own deterministic reads, validation, finalization, registry checks, and fallback execution mechanics.
- Runtime capability failures must be recorded as capability/environment evidence, not product implementation failure.
