---
name: completion-verifier
description: Run required checks and decide whether implementation has enough evidence to be treated as complete.
triggers:
  - "verify completion"
  - "completion verifier"
  - "done gate"
deepReferences:
  - references/evidence-classes.md
  - references/verdict-contract.md
---

# Completion Verifier

## Role

Decide whether a task, bounded implementation, or phase has fresh evidence for completion. The verifier classifies evidence; it does not implement missing work and does not turn adapter smoke into product acceptance.

## Hard Stops

- Do not pass completion with missing required checks.
- Do not pass product acceptance from adapter smoke, host capability, or fixture precondition evidence.
- Do not hide environment or runtime capability failures as implementation failures.
- Do not emit authoritative verdicts without identity fields, score state, and command evidence.

## Evidence Classes

- `adapter_smoke`: route health only; never product closeout.
- `workflow_contract`: harness invariant verification.
- `product_acceptance`: AC/SCN/user-facing acceptance; requires scorecard when configured.
- `runtime_capability`: tool, browser, MCP, fork, worktree, or shell capability.
- `host_environment`: OS, path, permission, encoding, and filesystem health.
- `closeout_scope`: repository and phase closeout scope.
- `fixture_precondition`: seed or precondition validity before product verification.

## Flow

1. Read the task/phase contract and required checks.
2. Map each command output to exactly one evidence class.
3. Confirm evidence freshness and identity.
4. Compare scorecard, QA report, verifier verdict, and phase status.
5. Return `passed`, `failed`, or `expected_blocker_passed` with a typed failure class.

## References

- `references/evidence-classes.md`: class semantics and closeout eligibility.
- `references/verdict-contract.md`: required verdict fields and stale evidence rules.
