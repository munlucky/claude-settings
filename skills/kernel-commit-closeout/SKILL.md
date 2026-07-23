---
name: kernel-commit-closeout
description: Internal Kernel skill for explicit, approved Git closeout after project knowledge commit.
user-invocable: false
---

# Kernel Commit Closeout Skill

Use for explicit, user-approved Git closeout (commit & push) after project knowledge closeout is completed.

## Hard Rules

- Require explicit user/task approval receipt before executing git operations.
- Exclude all generated, runtime, secret, and `.moonshot-relay` paths.
- Require knowledge commit receipt prior to Git closeout.
- Verify remote parity when push is requested.
