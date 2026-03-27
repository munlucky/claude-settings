# Skills.sh Workflow Alignment Context

Last-Reviewed: 2026-03-27

## Goal

Prepare a safe, repo-specific improvement package that adapts useful workflow patterns from `skills.sh` to this repository without replacing the existing Moonshot assets wholesale.

## Working Thesis

The main problem is not missing individual skills.

The main problem is that the end-to-end workflow is still spread across multiple rules, guides, and micro-skills:

- planning is strong
- verification is strong
- entrypoints are mostly clear
- review cadence, isolation setup, and finish/handoff are less explicit as named stages

`skills.sh` is strongest where it turns workflow into a visible stage model:

- plan
- isolate
- execute
- review
- verify
- finish

This repository should borrow that structure and tighten discoverability, bundle boundaries, and skill metadata rather than import external skills directly.

## Why This Exists

Recent local analysis already showed that the repository has enough good structure to preserve.

What is still missing for a broader workflow upgrade:

- an external benchmark for how stage-based skill workflows are presented
- a direct mapping from `skills.sh` patterns to current local skills
- a bounded first-pass change package that improves workflow clarity without runtime churn

## In Scope

- benchmark selected `skills.sh` workflow skills and extract reusable operating patterns
- map current entrypoints, bundles, gates, and utilities into a single stage model
- identify where existing skills should be kept, re-described, or repositioned
- define a first implementation wave for docs, rules, and skill metadata

## Out Of Scope

- importing external skill repositories
- replacing existing Moonshot entrypoints
- deleting or mass-renaming current skills
- changing runtime dispatch or shell adapters during preparation
- rewriting installation behavior

## Constraints

- preserve the three primary public entrypoints:
  - `product-orchestrator`
  - `moonshot-phase-runner`
  - `moonshot-orchestrator`
- prefer improving existing skills over adding new public surfaces
- keep repo-specific assets where they already provide clear value
- any new bundle or wrapper must reduce user-facing complexity, not widen it

## Required Outputs

This preparation package must contain:

- `context.md`
- `benchmark.md`
- `specification.md`
- `change-package.md`

## Ready For Change

Implementation may begin only when all of the following are true:

1. The `skills.sh` benchmark is reduced to explicit, repo-relevant patterns.
2. Every target workflow stage has declared local owners.
3. Gaps are framed as `improve existing`, `re-bundle`, or `add wrapper`, not as vague aspirations.
4. The first implementation wave is bounded to docs, rules, and metadata unless a later review expands scope.
5. Verification and completion discipline remains at least as strict as the current baseline.
