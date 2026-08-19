---
name: kernel-simplification-check
description: Internal conditional simplification guidance for non-trivial Kernel changes.
user-invocable: false
---

# kernel-simplification-check

When a non-trivial behavior-preserving change permits it, inspect unnecessary abstraction, duplicate logic, scope expansion, and speculative configuration. Before adding code, check whether deleting or reusing existing behavior can satisfy the same acceptance criteria. This is a lightweight review prompt, not a separate phase and not a completion authority.
