# Compatibility Contract Reference

Machine-readable compatibility anchors. Load only for compatibility audit.

## Default Paths

- `scripts/project-identity.mjs`
- `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/planning/packages/<plan-slug>/`
- `docs/implementation/<plan-slug>/`
- `ADR/*.md`
- `.claude/**`
- `namespaces.planningPackageRoot/<plan-slug>/`
- `references/plan-package-contract.md`
- `references/independent-review-loop.md`

## Hard Stops

- Do not mark a plan execution-ready when phase docs, dependencies, owned paths, read/write-set boundaries, or acceptance evidence are missing.
- Do not accept an architecture package handoff without `TRACEABILITY_MATRIX.md`, selected `ADR/*.md`, `ARCHITECTURE_REVIEW.md`, and task owner/verification signal mapping.
- Do not mark architecture-heavy plans execution-ready when a required `ARCHITECTURE_CONTRACT_SLICE` or `ARCHITECTURE_HANDOFF` is missing, blocked, or lacks verification signals.
- Do not allow child planning agents to mutate the source plan directly. Parent session owns final plan edits.
- Do not put live `.claude/**` adoption into early redesign phases unless the plan explicitly reserves a controlled adoption phase.
- Do not hard-code this repository's harness, package, doctor, installer, or profile-parity commands into a generic plan. Concrete gate commands must come from the target project's policy sources or be recorded as missing policy.
- Do not mark a plan execution-ready when it mutates package/runtime payloads, installed profiles, external services, or data/state without classifying that surface and naming required evidence slots.
- Do not hide unresolved ambiguity. Record it as an assumption, blocker, or user question.
- Phase inventory with dependencies, read-only paths, owned paths, and write-set boundaries.
- Surface classification for every planned mutation, including policy source paths and required evidence slots.
- Concrete gate commands only when sourced from the target project's policy documents; otherwise record the missing policy as a blocker or assumption.
- Plan graph readiness evidence when a package claims graph execution. Markdown-only packages remain supported, but do not label them graph-ready without validated DAG metadata.
- `references/plan-package-contract.md`: required files, phase metadata, and readiness checks.
