# Current Architecture

## Mode And Scope

- Mode: brownfield_codebase
- Input source: current repository checkout at `C:\dev\moonshot-relay`
- Architecture package path: `docs/implementation/current-architecture-2026-06-09`
- Knowledge anchors: no project-local `knowledgeAnchors` list is declared in root `AGENTS.md`; only the reusable anchor schema and policy text are present.
- Context builder: `node scripts/architecture-context-build.mjs --stage plan --mode brownfield_codebase --cwd . --json` returned advisory degraded status because account-root project knowledge records are not configured. This is non-blocking for repository-evidence recovery.

## Evidence Summary

| Evidence Path | Observation | Confidence |
|---|---|---|
| AGENTS.md | Declares canonical source boundaries, runtime profile boundaries, runtime contract entrypoints, and document path defaults. | high |
| README.md | Describes the product as a Claude/Codex Moonshot workflow harness and documents the public workflow entrypoints, installation path, runtime state exclusions, and active test gate. | high |
| docs/public/repository-layout.md | Defines source, local runtime profile, package payload, generated state, roadmap, and contributor boundaries. | high |
| docs/public/runtime-control-plane.md | Defines runtime-state sqlite as workflow authority for runs, blockers, resume state, verification evidence, and completion decisions. | high |
| package/package-contract.yaml | Defines canonical source roots, account-root install payload, runtime exposure entries, protected runtime state, public skill exposure, and excluded generated state. | high |
| package/runtime-surface.json | Defines the Claude/Codex profile-local public skill allowlist and preserves all canonical skills in the shared common payload. | high |
| schemas/verification.contract.yaml | Defines verification profiles, required planes, policy sets, artifact paths, runtime capability fields, and hard-fail criteria. | high |
| rules/workflow-bundles.yaml | Defines routing planes and bundle expansion for read-only, product project, and meta-harness work. | high |
| bin/moonshot-relay.mjs | Provides the public CLI wrapper for account-root install and project bridge installation. | high |
| scripts/install-account-root-harness.mjs | Implements account-root installation with common runtime payload, Claude/Codex exposure layers, protected entries, and manifests. | high |
| scripts/runtime-state.mjs | Provides the runtime-state CLI for status, leases, events, evals, completion decisions, resume snapshots, and memory promotion decisions. | high |
| scripts/verification-plane.mjs | Provides structured verification evidence, security assessment, and browser trace normalization entrypoints. | high |
| scripts/prepare-phase-runner-state.mjs | Bridges implementation plan packages into runtime-state run leases and resume snapshots. | high |
| scripts/phase-final-guard.mjs | Guards phase closeout and stop/turn-ended behavior from projection-only completion claims. | high |
| tests/active-contracts.test.mjs | Part of the official `npm test` active contract suite. | high |
| tests/package-materialization.test.mjs | Guards package/materialization behavior. | high |
| tests/runtime-control-plane-contract.test.mjs | Guards runtime-state authority behavior. | high |
| tests/verification-plane-contract.test.mjs | Guards verification-plane evidence behavior. | high |
| tests/moonshot-architecture-brownfield-flow.test.mjs | Guards brownfield architecture package contracts. | high |

## System Shape

Moonshot Relay is an account-root workflow harness and packaging system for Claude and Codex profiles. The repository is the canonical source for skills, agents, rules, schemas, templates, scripts, tools, docs, tests, and package contracts. Account-root installs materialize a shared runtime home under `MOONSHOT_RELAY_HOME` and thin Claude/Codex profile exposure layers.

The architectural center is a control-plane split:

- source control plane: tracked root-level source and public docs
- package/materialization plane: `package/package-contract.yaml`, `package/build-package.mjs`, and installer scripts
- runtime state plane: sqlite-backed state and evidence under `MOONSHOT_RELAY_HOME`
- workflow routing plane: public entrypoint skills plus internal bundle routing
- verification plane: structured evidence records and completion authority checks
- knowledge plane: project-scoped account-root knowledge records and controlled promotion lifecycle

## Runtime Flow

1. A user invokes a public runtime skill or the `moonshot-relay` CLI.
2. Routing classifies the request as read-only, product project, or meta-harness work through documented workflow bundles.
3. Product and architecture work create source-local packages under `docs/implementation/` or durable roadmaps under `docs/public/roadmaps/`.
4. Phase execution is prepared by `scripts/prepare-phase-runner-state.mjs`, which writes run identity, lease, and resume snapshot data into runtime-state.
5. Work evidence is recorded through runtime events, eval results, verification-plane summaries, browser traces, security assessments, and closeout events.
6. Completion is accepted only by runtime-state completion authority after required verification planes are fresh and blockers are absent.
7. Install and sync work materializes common payload into `MOONSHOT_RELAY_HOME` and profile-local exposure into `.claude` or `.codex`, preserving user auth/session/state entries.

## Authority Boundaries

| Boundary | Authority | Non-authority |
|---|---|---|
| Canonical source | Root `skills/`, `agents/`, `rules/`, `bin/`, `tools/`, `schemas/`, `templates/`, `tests/`, `docs/public/`, selected `scripts/` | Root `.claude/`, root `.codex`, generated profile output |
| Runtime profile discovery | `package/runtime-surface.json` | Ad hoc profile-local skill directories |
| Package materialization | `package/package-contract.yaml`, `package/build-package.mjs`, installer scripts | Manual profile edits |
| Completion | `scripts/runtime-state.mjs assess-completion` backed by runtime-state DB and verification-plane evidence | `phase-status.yaml`, QA reports, scorecards, final chat claims |
| Verification | `schemas/verification.contract.yaml` plus `scripts/verification-plane.mjs` | Stale command notes without identity or freshness |
| Knowledge promotion | project knowledge lifecycle and runtime-state memory promotion ledger | Transcript-only or imported-only memory notes |

## Capability Map

| Capability | Primary Source | Runtime Owner |
|---|---|---|
| Product definition | `skills/product-orchestrator/`, `templates/product-definition/` | public entrypoint |
| Architecture design | `skills/moonshot-architecture/`, `schemas/architecture/`, `scripts/architecture-context-build.mjs` | public entrypoint plus internal stage owners |
| Bounded implementation | `skills/moonshot-orchestrator/`, `rules/workflow-bundles.yaml` | public entrypoint |
| Phase execution | `skills/moonshot-phase-runner/`, `scripts/prepare-phase-runner-state.mjs`, `scripts/phase-final-guard.mjs` | public entrypoint and runtime-state |
| Plan package authoring | `skills/moonshot-plan-writer/`, `docs/implementation/` | public utility |
| Commit closeout | `skills/commit-moonshot/`, `scripts/commit-moonshot-*.mjs`, `scripts/lib/commit-closeout-events.mjs` | public utility and runtime events |
| Session logging | `skills/session-logger/` | public utility |
| Runtime state | `scripts/runtime-state.mjs`, `scripts/lib/runtime-state-store.mjs` | sqlite-backed local control plane |
| Verification evidence | `scripts/verification-plane.mjs`, `schemas/verification-plane.schema.json` | structured evidence plane |
| Installer/package | `bin/moonshot-relay.mjs`, `scripts/install-account-root-harness.mjs`, `package/` | account-root installer |
| Knowledge plane | `docs/public/project-knowledge-plane.md`, `scripts/knowledge-*.mjs`, `scripts/memorygraph-*.mjs` | project-scoped knowledge namespace |

## Owned Paths

| Path | Responsibility | Change Policy |
|---|---|---|
| docs/implementation/current-architecture-2026-06-09 | Current brownfield architecture recovery package. | owned |

## Read-only Paths

| Path | Reason |
|---|---|
| AGENTS.md | Source boundary and runtime contract evidence. |
| README.md | Product and workflow overview evidence. |
| docs/public/repository-layout.md | Canonical source and package boundary evidence. |
| docs/public/runtime-control-plane.md | Runtime-state authority evidence. |
| package/package-contract.yaml | Packaging and install contract evidence. |
| package/runtime-surface.json | Runtime public skill surface evidence. |
| schemas/verification.contract.yaml | Verification contract evidence. |
| rules/workflow-bundles.yaml | Workflow routing evidence. |
| bin/moonshot-relay.mjs | CLI boundary evidence. |
| scripts/install-account-root-harness.mjs | Account-root install evidence. |
| scripts/runtime-state.mjs | Runtime-state CLI evidence. |
| scripts/verification-plane.mjs | Verification-plane CLI evidence. |
| scripts/prepare-phase-runner-state.mjs | Phase-runner state bridge evidence. |
| scripts/phase-final-guard.mjs | Phase closeout guard evidence. |
| tests/active-contracts.test.mjs | Official active contract gate evidence. |

## Staged Paths

| Path | Planned Change |
|---|---|
| docs/implementation/current-architecture-2026-06-09/PLAN.md | Optional next-step plan derived from this architecture package. |

## Current Risks

- Runtime-state availability depends on Node 20+ and `better-sqlite3`; typed degradation is designed, but degraded state cannot claim completion authority.
- Public profile discovery is allowlist-only; accidental changes to `package/runtime-surface.json`, docs, tests, and install behavior can drift if not changed together.
- `.moonshot-relay/docs/phase-status.yaml` and closeout reports are useful projections, but treating them as authority would reintroduce false completion risk.
- Account-root live sync is a separate operational step from source correctness and must preserve sessions, auth, caches, and project knowledge state.
