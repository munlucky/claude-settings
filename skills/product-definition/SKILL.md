---
name: product-definition
description: Produce product-definition artifacts and a provenance-bound Task Contract Seed before Kernel execution.
user-invocable: true
---

# Product Definition

## Goal
Transform user ideas and problem statements into concrete, provenance-bound product definition artifacts and an advisory Task Contract Seed before Kernel execution.

## Context
- **Command**: `node scripts/kernel/standalone/product-definition.mjs [options]`
- **Storage**: Product artifacts written under the account-root project namespace (`.moon-relay-kernel/docs/tasks/...`).

## Autonomy & Priorities
- **Advisory Seed**: Emits a `TASK_CONTRACT_SEED`. The Kernel Host compares it against the user request and normalizes the authoritative contract.
- **Pre-Work Only**: Never executes code mutations or finalizes runs.

## Definition of Done
- Product intent, solution scope, and `TASK_CONTRACT_SEED` artifacts written with source provenance.

## Verification
- Confirm `TASK_CONTRACT_SEED` JSON contains valid objective, acceptance criteria, and allowed path boundaries.
