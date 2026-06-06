# Document Memory Policy

Canonical source guideline for keeping durable summaries separate from raw logs, transcripts, and generated state.

Durable memory stores decisions, recurring facts, and reusable lessons; raw logs and one-off traces stay in generated state.
Do not promote secrets, private transcripts, cache dumps, sqlite files, or browser artifacts into source docs.
When refreshing memory, record the source command or artifact and keep generated memory outputs unstaged unless explicitly requested.
Canonical docs should describe policy and contracts, while runtime memory records project-specific observations.

## Promotion Rules

Long-term memory promotion requires an explicit runtime ledger decision before any MemoryGraph or account-root memory write.
The required decision inputs are fresh evidence, independent reviewer approval, replay result, rollback plan, and scope owner.
If any input is missing, the promotion decision is recorded as rejected.

Do not copy raw MemoryGraph records, KG edges, ontology dumps, raw logs, transcripts, or secret-like strings into plan packages, public docs, QA reports, scorecards, or handoffs.
Use compact human-reviewed facts with provenance instead.

Memory is advisory context.
It can produce stale warnings in the read model, but it cannot satisfy `assess-completion` and cannot replace verification evidence.
