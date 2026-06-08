# Context Safety

Architecture context is prompt-facing only after compaction.

Allowed prompt content:

- compact policy anchors
- compact semantic facts
- compact architecture synopsis
- requirement and traceability focus
- status metadata and omission categories

Forbidden prompt content:

- raw MemoryGraph JSON
- raw KG edge dumps
- raw ontology dumps
- runtime logs
- browser scrapes
- transcripts
- prompt archives
- secret-like strings
- env/config secrets

If knowledge context is unavailable in advisory mode, record degraded status and continue. If strict mode is required, record the blocking metadata before dispatch.
