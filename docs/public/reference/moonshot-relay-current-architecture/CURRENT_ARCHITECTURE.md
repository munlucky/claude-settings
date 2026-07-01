# Current Architecture

## Evidence Table

| Evidence Path | Observation | Confidence |
|---|---|---|
| AGENTS.md | Defines repository canonical source boundaries, local runtime profile boundaries, runtime contract, default document paths, and knowledge anchor policy. | high |
| README.md | Describes installation, public workflow entrypoints, package/runtime state boundaries, official test gates, and generated-state exclusions. | high |
| docs/public/repository-layout.md | Documents canonical source, generated profile payloads, account-root runtime home, roadmap/execution scratch split, and contributor rules. | high |
| package/package-contract.yaml | Declares physical source, package payload, account-root install, public runtime skill exposure, support scripts, protected runtime entries, and excluded generated state. | high |
| package/runtime-surface.json | Defines the seven public runtime skills exposed in Claude/Codex profile-local discovery. | high |
| bin/moonshot-relay.mjs | Routes CLI commands to account-root installer, project bridge installer, and delivery submission support. | high |
| scripts/architecture-context-build.mjs | Builds prompt-safe architecture context and wraps project knowledge context without exposing raw graph/log/secret data. | high |
| scripts/architecture-artifact-validate.mjs | Validates required architecture package files, ADRs, traceability, Brownfield evidence, path boundaries, and plan readiness. | high |
| scripts/runtime-state.mjs | Exposes runtime-state CLI commands for leases, events, tool calls, evals, completion decisions, resume snapshots, and completion assessment. | high |
| scripts/prepare-phase-runner-state.mjs | Bridges plan packages to runtime state/readiness, phase status, execution root, and run lease creation. | high |
| tools/harness-lab/harness-lab.mjs | Provides source fingerprinting, package/eval/research fixture suites, comparison, baseline promotion, rollback, and container policy checks. | high |
| tests/moonshot-architecture-brownfield-flow.test.mjs | Holds regression coverage for Brownfield architecture package flow and validator expectations. | high |

## System Components

| Component | Responsibility | Primary Paths | Evidence |
|---|---|---|---|
| Source contract layer | Declares source boundaries, runtime surfaces, payload rules, generated-state exclusions, and contributor workflow. | `AGENTS.md`, `README.md`, `docs/public/repository-layout.md`, `package/package-contract.yaml` | Evidence Table |
| Runtime exposure layer | Limits profile-local skill discovery while preserving full shared payload in account-root runtime home. | `package/runtime-surface.json`, `package/profile-templates/**`, `package/build-package.mjs` | Evidence Table |
| CLI and installer layer | Installs account-root runtime, bridges project-local compatibility output, and submits delivery evidence. | `bin/moonshot-relay.mjs`, `scripts/install-account-root-harness.mjs`, `scripts/install-project-runtime-bridge.mjs`, `scripts/delivery-submit.mjs` | Evidence Table |
| Architecture design layer | Produces and validates prompt-safe architecture packages. | `skills/moonshot-architecture/**`, `scripts/architecture-*.mjs`, `schemas/architecture/**`, `templates/architecture/**`, `tests/moonshot-architecture-*.test.mjs` | Evidence Table |
| Phase/runtime state layer | Tracks run leases, phase status, runtime events, resume snapshots, completion decisions, and completion authority. | `scripts/runtime-state.mjs`, `scripts/prepare-phase-runner-state.mjs`, `scripts/lib/runtime-state-*.mjs` | Evidence Table |
| Verification and lab layer | Supplies active tests, package gates, eval gates, harness lab smoke/compare/promote flows, and verification-plane evidence. | `package.json`, `tools/evals/**`, `tools/harness-lab/**`, `scripts/verification-plane.mjs`, `tests/**` | Evidence Table |

## Data and Control Flow

1. Contributor changes canonical source under root source directories.
2. Package contract and runtime-surface manifest determine shared payload and profile-local public discovery.
3. Installers materialize account-root runtime and thin Claude/Codex exposure layers while preserving protected local state.
4. Workflow entrypoints produce product, architecture, plan, execution, verification, and closeout artifacts.
5. Runtime state records leases, events, evals, tool calls, completion decisions, and resume snapshots.
6. Verification gates read source tests, package dry-runs, evals, harness lab results, and runtime-state completion decisions before closeout claims.

## Owned Paths

| Path | Reason |
|---|---|
| docs/public/reference/moonshot-relay-current-architecture | New source-owned Brownfield architecture package. |

## Read-only Paths

| Path | Reason |
|---|---|
| AGENTS.md | Source boundary and knowledge anchor policy evidence. |
| README.md | Public workflow and verification contract evidence. |
| docs/public/repository-layout.md | Canonical source/runtime boundary evidence. |
| package/package-contract.yaml | Package/install/runtime exposure contract evidence. |
| package/runtime-surface.json | Public skill allowlist evidence. |
| bin/moonshot-relay.mjs | CLI routing evidence. |
| scripts/architecture-context-build.mjs | Architecture context builder evidence. |
| scripts/architecture-artifact-validate.mjs | Package validation contract evidence. |
| scripts/runtime-state.mjs | Runtime completion authority CLI evidence. |
| scripts/prepare-phase-runner-state.mjs | Phase-runner readiness bridge evidence. |
| tools/harness-lab/harness-lab.mjs | Quantitative harness gate evidence. |
| tests/moonshot-architecture-brownfield-flow.test.mjs | Brownfield regression evidence. |

## Staged Paths

| Path | Reason |
|---|---|
| docs/public/reference/moonshot-relay-current-architecture/ARCHITECTURE_BRIEF.md | Package entrypoint and handoff summary. |
| docs/public/reference/moonshot-relay-current-architecture/TRACEABILITY_MATRIX.md | Implementation handoff and verification mapping. |
| docs/public/reference/moonshot-relay-current-architecture/ARCHITECTURE_REVIEW.md | Architecture gate review result. |

## Constraints

- Do not mutate live `.claude/**`, `.codex/**`, account-root state, generated payloads, sqlite state, runtime logs, traces, browser artifacts, or verdict JSON during architecture design.
- Do not claim runtime installation parity from source-doc changes.
- Do not treat markdown package presence as completion authority for implementation.
- Use `node scripts/architecture-artifact-validate.mjs` as the package contract gate for this artifact.
