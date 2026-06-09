# Requirement Inventory

| Requirement ID | Source | Requirement | Owner | Verification Signal |
|---|---|---|---|---|
| REQ-101 | AGENTS.md, docs/public/repository-layout.md | Keep canonical source in tracked root-level source directories and keep root `.claude/` and `.codex/` as local runtime profiles, not durable source. | repository | `npm test` package/layout/materialization contracts pass |
| REQ-102 | package/package-contract.yaml, package/runtime-surface.json | Materialize account-root common payload while exposing only the public runtime skill allowlist in Claude/Codex profile-local discovery. | package | `npm run test:package` and runtime-surface contract tests pass |
| REQ-103 | docs/public/runtime-control-plane.md, scripts/runtime-state.mjs | Use runtime-state sqlite as the authority for run leases, blockers, resume state, and whole-plan completion decisions. | runtime-state | runtime-control-plane and completion-authority contract tests pass |
| REQ-104 | schemas/verification.contract.yaml, scripts/verification-plane.mjs | Require structured verification-plane evidence for accepted completion, with canonical completion planes `unit`, `package`, `installer`, `browser`, `security`, and `quality`. | verification | verification-plane and completion-authority contract tests pass |
| REQ-105 | rules/workflow-bundles.yaml, README.md | Route work through public entrypoints and internal bundles according to execution plane and task complexity. | workflow | workflow-e2e and active contract tests pass |
| REQ-106 | docs/public/project-knowledge-plane.md, scripts/knowledge-context-build.mjs | Keep project knowledge scoped, evidence-gated, and non-authoritative for completion unless promoted through the lifecycle. | knowledge | knowledge-context-build and memory-promotion contract tests pass |
| REQ-107 | skills/moonshot-architecture/SKILL.md, scripts/architecture-context-build.mjs | Produce architecture packages with ASRs, C4/ADR, tradeoff review, traceability, and handoff boundaries before implementation planning. | architecture | moonshot-architecture brownfield flow and artifact validator pass |
