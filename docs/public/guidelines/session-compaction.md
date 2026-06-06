# Session Compaction

Canonical source guideline for compacting session notes without copying raw transcripts.

Compaction should preserve objective, decisions, changed files, commands, verification results, blockers, and next steps.
Drop repeated status chatter, raw logs, secrets, and low-value command output unless needed to reproduce a failure.
Keep source-grounded facts with path references and mark stale or memory-derived facts clearly.
Prefer the runtime status read model over raw transcript replay when reconstructing active contract, latest verdict, current blocker, lineage, stale warnings, and next action.
Use `scripts/context-state.mjs compact --json` or the library equivalent for long-running phase handoff compaction.
Compaction may omit raw event history and repeated chatter, but it must not lose objective, phase, current blocker, lineage, assumptions, evidence, changed files, open risks, or next action.
Rehydration should use `scripts/context-state.mjs rehydrate --json` to produce a phase brief from the compact DB-derived state, not from a copied transcript.
A compacted handoff must let the next run continue without redoing broad discovery.
