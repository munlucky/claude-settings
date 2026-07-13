# Compatibility Contract Reference

Machine-readable compatibility anchors. Load only for compatibility audit.

## Default Paths

- `docs/public/guidelines/research-evidence-policy.md`
- `C4/*.md`
- `ADR/*.md`
- `.claude/**`
- `.codex/**`

## Hard Stops

- Do not skip ASR extraction for non-trivial PRDs.
- In `greenfield_prd` mode, do not require Brownfield current-architecture evidence.
- Do not claim architecture readiness without ADRs for significant decisions.
- Do not produce a Greenfield implementation `PLAN.md` unless every accepted requirement maps to a quality scenario, ASR, ADR, task owner, and verification signal.
- Do not hand off to implementation without traceability from accepted requirements to owners and verification signals.
- Do not hand off to implementation without `architecture-gate-reviewer` readiness evidence.
- Do not invent Brownfield current architecture without repository evidence.
- Do not inline raw MemoryGraph records, KG edge dumps, ontology dumps, runtime logs, transcripts, browser scrapes, or secret-like strings.
- Do not mutate live `.claude/**`, `.codex/**`, account-root state, or runtime profiles during architecture design.
- Do not replace `moonshot-phase-runner` completion authority or `scripts/runtime-state.mjs assess-completion`.
