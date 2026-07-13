# Compatibility Contract Reference

Machine-readable compatibility anchors. Load only for compatibility audit.

## Default Paths

- `ADR/*.md`
- `docs/public/guidelines/minimal-correct-implementation.md`
- `docs/public/guidelines/agent-operating-policy.md`
- `docs/public/guidelines/retrieval-and-recency-policy.md`
- `docs/public/guidelines/untrusted-content-boundary.md`
- `docs/public/guidelines/skill-readiness-policy.md`
- `scripts/architecture-feedback-render.mjs`
- `references/bounded-flow.md`
- `references/review-and-verification.md`

## Hard Stops

- Do not broaden scope beyond the user request.
- Do not skip code review for non-trivial code changes.
- Do not claim completion with stale, missing, or smoke-only evidence.
- Do not execute a blocked `ARCHITECTURE_HANDOFF`, and do not bypass a ready handoff by copying raw KG, ontology, MemoryGraph, log, transcript, or browser scrape payloads into the attempt prompt.
- When runtime-state completion authority is available, do not claim clean finish from chat output, markdown reports, phase status, or verifier JSON alone. Require `scripts/runtime-state.mjs assess-completion` to produce an accepted DB decision.
- Before approval-required operations or writes near protected runtime paths, classify the operation with `tools/sandbox/policy.mjs check --json`; unauthorized blocking events must stop clean completion.
- Do not mutate unrelated files or revert user changes.
- Stop for clarification only when a wrong assumption would change scope, security, data shape, or user-visible behavior.
- Explicit blocker classification if a required check cannot run.
