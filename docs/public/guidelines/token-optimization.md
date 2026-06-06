# Token Optimization

Canonical source guideline for keeping context compact without losing required evidence.

Load broad context only until the decision boundary is clear, then switch to targeted file and command reads.
Summarize long logs and documents, but preserve exact error text, commands, paths, and line references needed for diagnosis.
Avoid carrying stale plans forward when current source is cheap to verify.
Put stable policy and source contracts first, then compact dynamic runtime state from `scripts/runtime-state.mjs status --json`; avoid copying raw logs or transcripts into prompts unless they are needed to reproduce a failure.
For reusable phase prompts, assemble with a stable policy/tool prefix before the volatile runtime tail. `scripts/context-state.mjs assemble-prompt --json` records `stablePrefixHash`, `promptCacheHit`, and `contextCompactionRatio` so prompt-cache behavior and compaction loss can be audited.
Keep public tool context bounded through `tools/agent-api/registry.yaml`: expose group summaries first, then promote full schemas only through `tools/agent-api/dispatch.mjs` for selected groups. Rejected or wrong-tool calls must be recorded with `schema_mode=rejected`.
Compaction should reduce repetition without dropping blockers, assumptions, verification evidence, or user constraints.
