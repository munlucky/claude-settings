---
name: moonshot-plan-writer
description: Create, refresh, and organize project-scoped account-root master and phase plans for phase-based work.
triggers:
  - "write plan"
  - "master plan"
  - "phase plan"
  - "implementation plan"
deepReferences:
  - references/plan-package-contract.md
  - references/independent-review-loop.md
---

# Moonshot Plan Writer

## Role

Create or revise a phase-plan package that a phase runner can execute without guessing. The output is a master plan plus numbered phase docs, execution metadata, acceptance criteria, blockers, surface classification, and a clear adoption boundary.

By default, write plan packages under the account-root project namespace resolved by `scripts/project-identity.mjs`, for example `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/planning/packages/<plan-slug>/`. Use repo-local `docs/implementation/<plan-slug>/` only when the operator explicitly asks for a tracked source design package or when existing tracked docs are the source artifact being revised.

## Hard Stops

- Do not mark a plan execution-ready when phase docs, dependencies, owned paths, read/write-set boundaries, or acceptance evidence are missing.
- Do not accept an architecture package handoff without `TRACEABILITY_MATRIX.md`, selected `ADR/*.md`, `ARCHITECTURE_REVIEW.md`, and task owner/verification signal mapping.
- Do not mark architecture-heavy plans execution-ready when a required `ARCHITECTURE_CONTRACT_SLICE` or `ARCHITECTURE_HANDOFF` is missing, blocked, or lacks verification signals.
- Do not allow child planning agents to mutate the source plan directly. Parent session owns final plan edits.
- Do not put live `.claude/**` adoption into early redesign phases unless the plan explicitly reserves a controlled adoption phase.
- Do not hard-code this repository's harness, package, doctor, installer, or profile-parity commands into a generic plan. Concrete gate commands must come from the target project's policy sources or be recorded as missing policy.
- Do not mark a plan execution-ready when it mutates package/runtime payloads, installed profiles, external services, or data/state without classifying that surface and naming required evidence slots.
- Do not hide unresolved ambiguity. Record it as an assumption, blocker, or user question.

## Flow

1. Identify the user objective and existing plan directory.
1.1. Resolve project identity and choose the plan root. Prefer `namespaces.planningPackageRoot/<plan-slug>/` so concurrent work in different repositories cannot collide. Record the projectId and selected account-root plan directory in the master plan metadata.
2. Audit current artifacts and stale phase docs.
3. Draft or refresh `00-master-plan-*.md` and root `NN-*.md` phase files.
4. Classify every planned change surface as `source_only`, `package_runtime_payload`, `installed_profile_or_account_root`, `external_deployment_or_service`, or `data_or_state_migration`.
5. Load only the applicable local policy sources for those surfaces, such as root `AGENTS.md`, verification contracts, deployment runbooks, package contracts, migration policies, or project-local guideline anchors.
6. Add phase execution metadata: dependencies, conflicts, owned paths, staged paths, read-only paths, write-set boundaries, adoption targets, live mutation policy, policy source paths, and required evidence slots.
7. When an architecture package is present, map selected ADRs and `TRACEABILITY_MATRIX.md` rows into phase scope, owners, verification signals, and acceptance evidence.
8. When `ARCHITECTURE_HANDOFF.json` is present, carry only its path, status, selected decision IDs, selected constraint IDs, owned/read-only/staged paths, verification signal IDs, and blocking preconditions into phase metadata.
9. When a Discovery Map is provided, consume only resolved decisions with evidence and decision authority. Do not execute tickets directly, and do not treat frontier output as fanout, promotion, completion, or runtime-state authority.
10. Draft Spec-Test Obligations for every detailed `REQ-*`, every `SCN-*`, and every UAT-critical item. Use `specTestObligations` rows with `verificationMode: tdd_red_green` by default for behavior-changing work, `characterization_first` for brownfield pinning, and `evidence_mandatory` only with command, artifact, and reason.
11. Run independent review loops as sidecar review, then parent applies accepted edits.
12. Prepare execution only after readiness, traceability, handoff status, phase boundary, surface classification, policy-sourced adoption checks, and spec-test obligation coverage are satisfied.

## Required Evidence

- Plan directory and master plan path.
- Phase inventory with dependencies, read-only paths, owned paths, and write-set boundaries.
- Acceptance criteria mapped to phase evidence.
- Architecture package path inventory when used, including traceability matrix, selected ADRs, architecture review, and any Brownfield evidence boundary.
- Architecture handoff path and status when used, including selected constraints, selected verification signals, and blocked/ready decision.
- Review loop findings and accepted changes.
- Surface classification for every planned mutation, including policy source paths and required evidence slots.
- Explicit adoption strategy for workflow, skill, agent, package/runtime, deployment/service, profile/account-root, and data/state surfaces that are in scope.
- Concrete gate commands only when sourced from the target project's policy documents; otherwise record the missing policy as a blocker or assumption.
- Plan graph readiness evidence when a package claims graph execution. Markdown-only packages remain supported, but do not label them graph-ready without validated DAG metadata.
- Spec-Test Obligations coverage: generated `specTestObligations` rows for all `REQ-*`, `SCN-*`, and UAT-critical items, including `interface`, `depth`, `environment`, `verificationMode`, commands, and evidence paths.
- Seam rationale coverage: for behavior-changing work, include `highestPublicSeam` or `seamRationale` so strict seam validation can explain why the chosen test boundary is the highest practical public seam.
- Validator command for execution packages that include obligation rows: `scripts/spec-test-obligations.mjs validate --json`.
- Discovery Map evidence, when used: path to `DISCOVERY_MAP.md` or `discovery-map.json`, resolved decision IDs consumed, unresolved tickets carried as assumptions or blockers, and confirmation that frontier output did not authorize execution or agent fanout.

## References

- `references/plan-package-contract.md`: required files, phase metadata, and readiness checks.
- `references/independent-review-loop.md`: reviewer loop rules and parent-owned edit boundary.

## Project Knowledge Context Contract

Planning intake may consume `projectKnowledgeContext` with `stage=plan`, but it must preserve omissions and status as typed metadata. Independent review prompts receive only the compact `## Project Knowledge Context` block.

Plan packages may record knowledge status and omission categories. They must not copy raw MemoryGraph/KG/ontology records, runtime logs, transcripts, or secret-like strings into master plans, phase docs, or review briefs.
