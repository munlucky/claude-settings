# Skill Architecture Rework Context

Last-Reviewed: 2026-03-27

## Goal

Prepare a safe pre-implementation workflow for reorganizing local skills and agents without replacing them wholesale.

This task stops immediately before source edits to:
- `.claude/skills/**`
- `.claude/agents/**`
- `.claude/rules/**`
- workflow scripts that route execution

## Working Thesis

The current repo does not need a full reset.

It needs:
- a clearer public entrypoint model
- stricter boundaries between orchestrators, bundles, micro-skills, and adapters
- a repeatable decision process for `keep / merge / retire / improve`

The current operating assumption is:
- `product-orchestrator` is the product-definition entry
- `moonshot-phase-runner` is the default entry for large phase-based work
- `moonshot-orchestrator` is the bounded implementation entry

## Why This Exists

Recent analysis showed:
- the repo already has strong workflow assets and should not be replaced blindly
- some responsibilities overlap across Moonshot analysis, execution, review, and documentation skills
- public entrypoints and internal execution parts are not clearly separated in one place
- composition metadata has drift, for example `code-simplifier` is referenced in a bundle but not present in `.claude/skills/`

## In Scope

- inventory current skills, agents, gates, bundles, and execution adapters
- define tier model and ownership boundaries
- classify each asset as `keep`, `merge candidate`, `retire candidate`, or `improve`
- document preconditions required before touching runtime behavior
- prepare a cutover plan for later implementation work

## Out Of Scope

- editing skill behavior
- renaming skills or agents
- deleting files
- changing shell/runtime dispatch
- modifying installation behavior
- changing verification strictness defaults

## Constraints

- preserve repo-specific assets where they provide domain value
- do not import external skills as defaults during this preparation stage
- keep micro-skills when they provide a real single responsibility
- simplify public invocation surface before simplifying internal building blocks
- any merge decision must preserve current execution semantics or declare the exact change

## Required Outputs

Before implementation starts, the task package must contain:
- this context document
- a step-by-step preparation specification
- an inventory matrix covering current assets
- an explicit `Ready For Change` gate

## Initial Tier Hypothesis

### Tier 1: Public Entrypoints

- `product-orchestrator`
- `moonshot-phase-runner`
- `moonshot-orchestrator`

### Tier 2: Composition And Control

- workflow bundles
- team runners
- phase executor
- coordinator skills

### Tier 3: Micro-Skills

- gates
- analyzers
- reviewers
- runners
- document operations

### Tier 4: Internal Adapters

- shell scripts
- runtime bridge scripts
- execution dispatch wrappers

## Ready For Change

Implementation work may begin only when all of the following are true:

1. Every current skill and agent is classified.
2. Every public entrypoint has a declared purpose and exclusion boundary.
3. Every merge candidate has a rollback-safe migration note.
4. Every retire candidate has a replacement path or a usage verdict of effectively unused.
5. Bundle definitions and actual files are reconciled.
6. No unresolved ambiguity remains around large-work entry behavior.

If any item above is false, stop at documentation and do not edit runtime assets.
