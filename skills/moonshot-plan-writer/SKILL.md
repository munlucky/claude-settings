---
name: moonshot-plan-writer
description: Create, refresh, and organize project-scoped account-root master and phase plans for phase-based work.
policyClauseIds:
  - moonshot-plan-writer.policy.use-when
  - moonshot-plan-writer.policy.routing
  - moonshot-plan-writer.policy.hard-stops
  - moonshot-plan-writer.policy.output-contract
policyDigest: bf70b96da2991def9fd97c88cde29ce07fa7e73ba0ba5c1a06d3241207663c70
triggers:
  - "write plan"
  - "master plan"
  - "phase plan"
  - "implementation plan"
deepReferences:
  - references/compatibility-contract.md
  - references/plan-package-contract.md
  - references/independent-review-loop.md
---

# Moonshot Plan Writer

## Use When

Use to create or refresh a master and phase plan package for phase execution.

## Route Away

Use `moonshot-architecture` when decisions are missing and `moonshot-orchestrator` for one bounded implementation.

## Role

Create an executable master/phase plan with scope, evidence, and adoption boundaries. Default to `planningPackageRoot`; use tracked plans only when requested.

## Hard Stops

- Do not mark a plan execution-ready when phase docs, dependencies, owned paths, read/write-set boundaries, or acceptance evidence are missing.
- Do not accept an architecture package handoff without `TRACEABILITY_MATRIX.md`, selected `ADR/*.md`, `ARCHITECTURE_REVIEW.md`, and task owner/verification signal mapping.
- Do not mark architecture-heavy plans execution-ready when a required `ARCHITECTURE_CONTRACT_SLICE` or `ARCHITECTURE_HANDOFF` is missing, blocked, or lacks verification signals.
- Do not allow child planning agents to mutate the source plan directly. Parent session owns final plan edits.
- Do not put live `.claude/**` adoption into early redesign phases unless the plan explicitly reserves a controlled adoption phase.
- Do not hard-code this repository's harness, package, doctor, installer, or profile-parity commands into a generic plan. Concrete gate commands must come from the target project's policy sources or be recorded as missing policy.
- Do not mark a plan execution-ready when it mutates package/runtime payloads, installed profiles, external services, or data/state without classifying that surface and naming required evidence slots.
- Do not hide unresolved ambiguity. Record it as an assumption, blocker, or user question.

## Procedure

1. Resolve objective, project identity, plan root, and stale artifacts; draft the master and phase files.
2. Classify mutation surfaces, load applicable local policies, and declare dependencies, write sets, adoption targets, and evidence slots.
3. Map selected architecture decisions, traceability rows, handoff status, owners, and verification signals into phase scope.
3.1. Map selected ADRs and `TRACEABILITY_MATRIX.md` rows into phase metadata.
4. Do not treat Discovery Map frontier output as execution, fanout, promotion, completion, or runtime-state authority.
5. Draft Spec-Test Obligations for every detailed requirement, scenario, and UAT-critical item.
6. Run independent sidecar review; the parent applies accepted edits and opens execution only after all readiness gates pass.

## Output Contract

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
