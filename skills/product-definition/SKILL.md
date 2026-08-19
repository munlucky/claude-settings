---
name: product-definition
description: Produce product-definition artifacts and a provenance-bound Task Contract Seed before Kernel execution.
user-invocable: true
---

# Product Definition

This pre-work utility writes product artifacts under the account-root project namespace. It emits a `TASK_CONTRACT_SEED` with artifact and source provenance. The seed is advisory: the Kernel Host must compare it with the current user request, reject stale conflicts, and normalize the final Task Contract.
