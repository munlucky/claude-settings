# C4 Component

## Components

| Component | Container | Responsibility | Requirement IDs |
|---|---|---|---|
| `AGENTS.md` | Canonical source | Source checkout entrypoint and project-local policy TOC. | REQ-101 |
| `package/package-contract.yaml` | Package/materialization | Declares source roots, payload entries, runtime exposure entries, protected state, and excluded generated state. | REQ-101, REQ-102 |
| `package/runtime-surface.json` | Runtime discovery | Single authority for Claude/Codex profile-local public skill allowlist. | REQ-102, REQ-105 |
| `bin/moonshot-relay.mjs` | CLI | Dispatches install and bridge commands to installer scripts. | REQ-102 |
| `scripts/install-account-root-harness.mjs` | Installer | Materializes common runtime payload and runtime-specific exposure while preserving protected entries. | REQ-102 |
| `scripts/runtime-state.mjs` | Runtime control plane | Provides run lease, blocker, resume, event, eval, memory promotion, and completion authority commands. | REQ-103, REQ-106 |
| `scripts/verification-plane.mjs` | Verification plane | Records structured verification summaries, browser traces, and security assessments. | REQ-104 |
| `scripts/prepare-phase-runner-state.mjs` | Phase bridge | Converts plan package inputs into runtime run identity, lease, and resume snapshot data. | REQ-103, REQ-105 |
| `scripts/phase-final-guard.mjs` | Closeout guard | Prevents stop/turn-ended flows from treating actionability projections as final completion. | REQ-103 |
| `rules/workflow-bundles.yaml` | Workflow routing | Maps execution planes to bundle chains and internal stage expansion. | REQ-105 |
| `skills/moonshot-architecture/` | Architecture workflow | Produces architecture packages with ASR, C4/ADR, traceability, and handoff readiness. | REQ-107 |
| `scripts/architecture-context-build.mjs` | Architecture context | Builds prompt-safe architecture context from project knowledge status metadata. | REQ-107 |
| `docs/public/project-knowledge-plane.md` | Knowledge plane | Defines observe/stage/verify/promote/supersede/archive lifecycle and promotion gates. | REQ-106 |
| `tests/*` | Verification | Guards source, package, runtime-state, verification-plane, workflow, and architecture contracts. | REQ-101, REQ-102, REQ-103, REQ-104, REQ-105, REQ-106, REQ-107 |
