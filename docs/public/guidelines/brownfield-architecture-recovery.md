# Brownfield Architecture Recovery Guideline

Brownfield architecture work starts by reading the current repository before proposing a new structure.

Recover current architecture from source paths, tests, package scripts, runtime configuration, public docs, and existing boundaries.

Record evidence for claims about modules, adapters, data stores, APIs, events, queues, external systems, and operational constraints.

Separate owned paths, read-only paths, staged paths, and shared mutable paths before implementation planning.

When migration is required, write a compatibility contract and risk register before producing `SPEC_DELTA.md` or `PLAN.md`.

Do not invent current architecture from preferred patterns. Unsupported claims must remain assumptions or blockers.
