# Document Memory Policy

Canonical source guideline for keeping durable summaries separate from raw logs, transcripts, and generated state.

Durable memory stores decisions, recurring facts, and reusable lessons; raw logs and one-off traces stay in generated state.
Do not promote secrets, private transcripts, cache dumps, sqlite files, or browser artifacts into source docs.
When refreshing memory, record the source command or artifact and keep generated memory outputs unstaged unless explicitly requested.
Canonical docs should describe policy and contracts, while runtime memory records project-specific observations.
