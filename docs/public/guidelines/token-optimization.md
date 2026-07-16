# Token Optimization

Canonical source guideline for keeping context compact without losing required evidence.

Load broad context only until the decision boundary is clear, then switch to targeted file and command reads.
Summarize long logs and documents, but preserve exact error text, commands, paths, and line references needed for diagnosis.
Avoid carrying stale plans forward when current source is cheap to verify.
Put stable policy and source contracts first, then compact dynamic runtime state from `scripts/runtime-state.mjs status --json`; avoid copying raw logs or transcripts into prompts unless they are needed to reproduce a failure.
For reusable phase prompts, assemble with a stable policy/tool prefix before the volatile runtime tail. `scripts/context-state.mjs assemble-prompt --json` records `stablePrefixHash`, `promptCacheHit`, and `contextCompactionRatio` so prompt-cache behavior and compaction loss can be audited.
Keep public tool context bounded through `tools/agent-api/registry.yaml`: expose group summaries first, then promote full schemas only through `tools/agent-api/dispatch.mjs` for selected groups. Rejected or wrong-tool calls must be recorded with `schema_mode=rejected`.
Compaction should reduce repetition without dropping blockers, assumptions, verification evidence, or user constraints.

## Public Skill Budgets and Deletion Evidence

`scripts/lint-skills.mjs` is the blocking contract for the eight public runtime skills. It records the deterministic UTF-8-byte/4 token estimate and enforces the exact accepted P04 estimate as a no-growth ceiling, plus catalog invocation metadata, conditional-loading declarations, resolvable deep references, trigger fixtures, translation parity, and duplicate hard-stop/completion prose. Any token growth requires an explicit reviewed budget-ratchet change and must still preserve the P01-to-candidate median reduction gate.

Warning fingerprints may be captured as a baseline. A comparison run must fail on any new blocking finding or warning; legacy warnings outside the target public surface are carry-forward evidence, not permission to add more warnings.

`tools/evals/skill-deletion-eval.mjs` generates sentence-removal candidates and compares each candidate with its unchanged baseline using the same trigger, process, outcome, and premature-completion measures. It never edits canonical skills. A sentence whose removal worsens any metric is retained; an eligible result is review evidence only and does not authorize automatic deletion.
