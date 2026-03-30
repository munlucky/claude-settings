# Skill Architecture Rework Preparation Specification

Last-Reviewed: 2026-03-27

## Objective

Define every step required before editing skills, agents, rules, or runtime adapters.

This document ends at the change gate.
Actual implementation is intentionally excluded.

## Phase Map

### Phase 0. Freeze The Problem Statement

Goal:
- lock the intent of the rework before solutions drift

Actions:
- confirm the target is architectural reorganization, not wholesale replacement
- confirm large-work entry behavior uses `moonshot-phase-runner`
- confirm micro-skills are preserved unless there is a strong reason otherwise

Outputs:
- explicit problem statement
- explicit non-goals

Exit criteria:
- no ambiguity remains about the purpose of the task

### Phase 1. Inventory The Current System

Goal:
- produce a complete asset list

Actions:
- enumerate all skills under `.claude/skills/`
- enumerate all agents under `.claude/agents/`
- enumerate bundles, gates, runners, and execution adapters referenced by docs
- capture missing-file drift between bundle definitions and actual filesystem state

Outputs:
- `inventory.md`

Exit criteria:
- every referenced workflow asset is either found or marked missing

### Phase 2. Define The Tier Model

Goal:
- create one authoritative boundary model

Actions:
- assign each asset to one tier only:
  - public entrypoint
  - composition/control
  - micro-skill
  - internal adapter
- declare allowed call directions between tiers
- declare which tiers are user-facing and which are internal only

Outputs:
- tier classification section in `inventory.md`

Exit criteria:
- no asset remains unassigned

### Phase 3. Evaluate Responsibility Overlap

Goal:
- identify redundancy without destroying useful micro-skills

Actions:
- compare assets by trigger surface, inputs, outputs, and invocation frequency
- separate true duplication from healthy composition
- flag ambiguous boundaries, for example:
  - multiple analyzers producing similar planning signals
  - multiple execution skills acting as entrypoints
  - multiple verification layers without clear gate order

Outputs:
- overlap notes in `inventory.md`

Exit criteria:
- every flagged overlap has a proposed resolution type:
  - keep separate
  - hide behind bundle
  - merge later
  - retire later

### Phase 4. Classify Assets

Goal:
- produce a decision matrix for all current assets

Actions:
- assign one decision to each asset:
  - `keep`
  - `merge_candidate`
  - `retire_candidate`
  - `improve`
- record decision rationale
- record any dependency or migration risk

Outputs:
- decision matrix in `inventory.md`

Exit criteria:
- every current skill and agent has exactly one decision

### Phase 5. Design The Future Invocation Surface

Goal:
- simplify how humans and orchestrators enter the system

Actions:
- define the public entrypoint policy
- define when to use:
  - `product-orchestrator`
  - `moonshot-phase-runner`
  - `moonshot-orchestrator`
- declare which skills should no longer be called directly by users
- declare which components remain internal implementation details

Outputs:
- invocation policy section in `inventory.md`

Exit criteria:
- large, medium, and small work each have an unambiguous entry rule

### Phase 6. Reconcile Bundles And Execution Contracts

Goal:
- ensure composition metadata matches reality

Actions:
- compare bundle definitions against actual skills
- identify dead references and hidden dependencies
- verify bridge artifacts and verification gates still line up with the proposed entry model

Outputs:
- reconciliation section in `inventory.md`

Exit criteria:
- all bundle/file mismatches are documented

### Phase 7. Prepare The Change Package

Goal:
- make implementation safe and reviewable

Actions:
- write migration notes for each `merge_candidate` and `retire_candidate`
- identify files that will change in the first implementation pass
- define rollback boundaries
- define how success will be validated after edits

Outputs:
- `change-package.md`

Exit criteria:
- first implementation pass can be described as a bounded file set

### Phase 8. Ready For Change Gate

Goal:
- stop before code changes until the package is coherent

Checklist:
- inventory complete
- tier model complete
- decision matrix complete
- invocation policy complete
- bundle drift documented
- migration notes written
- rollback boundaries declared

Result:
- if all pass, implementation may start
- if any fail, remain in documentation mode

## Artifact Contract

The preparation package must contain:
- `context.md`
- `specification.md`
- `inventory.md`
- `change-package.md`

## Rules

- do not edit runtime assets during Phases 0 through 8
- do not delete anything during preparation
- do not treat low-confidence intuition as an architecture decision
- record uncertainty explicitly instead of smoothing it over

## First Implementation Boundary

The first implementation pass should usually touch:
- classification metadata
- bundle definitions
- documentation references

It should not begin with:
- mass renames
- file deletions
- installer changes
- runtime dispatch rewrites
