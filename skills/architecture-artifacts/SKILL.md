---
name: architecture-artifacts
description: Produce architecture artifacts and a provenance-bound Task Contract Seed before Kernel execution.
user-invocable: true
---

# Architecture Artifacts

## Goal
Generate rigorous architecture artifacts (ASR, domain models, options, tradeoffs, C4 diagrams, ADRs) and an advisory Task Contract Seed before Kernel implementation starts.

## Context
- **Command**: `node scripts/kernel/standalone/architecture-artifacts.mjs [options]`
- **Namespace**: Stored under project agreement packages (`.moon-relay-kernel/docs/agreements/...`).

## Autonomy & Priorities
- **Seed Only**: Emits a provenance-bound `TASK_CONTRACT_SEED`; has zero implementation, proof, review, or completion authority.
- **Evidence-Grounded**: Ground architectural tradeoffs in verified codebase realities, not speculative abstractions.

## Definition of Done
- Complete architecture package generated with clear component boundaries, ADRs, and Task Contract Seed.

## Verification
- Validate generated ADRs and architecture schema using `node scripts/architecture-artifact-validate.mjs`.
