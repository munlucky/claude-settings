# Compatibility Contract Reference

Machine-readable compatibility anchors. Load only for compatibility audit.

## Default Paths

- `docs/daily/YYYY-MM-DD/{runtime}.md`
- `docs/daily/README.md`
- `{tasksRoot}/{feature-name}/session-logs/day-YYYY-MM-DD.md`
- `{tasksRoot}/{feature-name}/HANDOFF.md`
- `.moonshot-relay/docs/solutions/`

## Hard Stops

- keep active logs under the document memory ceilings
- move long timelines and raw review detail to archive
- keep `HANDOFF.md` summary-first and artifact-reference-first
- before finish/handoff logging, build or refresh `projectKnowledgeContext` with `knowledge-context-build.mjs --stage finish --json`
- record only compact knowledge status, warning codes, artifact references, and reusable decisions; never paste raw MemoryGraph/KG/ontology/log/transcript payloads into session logs or `HANDOFF.md`
- when the user explicitly asks for graph refresh, run `project-memory-refresh`; otherwise finish logging remains read-only and may create promotion candidates only
- use knowledge writes only for reusable decisions, corrections, fixes, or project-specific conventions that pass the verify/promote lifecycle
- do not use `.moonshot-relay/docs/ko/` as a MemoryGraph source; it is a human-facing Korean mirror
- promote reusable remediation patterns to `.moonshot-relay/docs/solutions/` when justified
- create harness promotion candidates only; do not write promoted facts into `moonshot-relay` without explicit approval
- append correction events instead of rewriting prior history
