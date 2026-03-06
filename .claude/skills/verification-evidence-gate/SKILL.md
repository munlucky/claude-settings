---
name: verification-evidence-gate
description: Strict workflow gate that blocks completion claims unless fresh verification evidence exists.
---

# Verification Evidence Gate

## Role
Enforce evidence-before-completion in strict profile execution.

## When to use
- After `completion-verifier` (or fallback verification in simple flow).
- Immediately before any "complete/passed/fixed" statement.

## Inputs
- `analysisContext.signals.workflowProfile`
- `analysisContext.signals.allowIndeterminate`
- `completionStatus.*` (if present)
- `analysisContext.notes`

## Gate logic
1. If `workflowProfile != strict`: return pass with note.
2. For `strict`, require fresh evidence:
   - Preferred: `completionStatus.verificationState == passed`.
   - Fallback: notes contain explicit success evidence for verification command outputs.
3. Hard block conditions:
   - `verificationState == failed`
   - `verificationState == indeterminate`
   - No evidence of a fresh verification run
4. If blocked, prevent completion claims and return remediation instructions.

## Output (patch)
```yaml
notes:
  - "verification-evidence-gate: passed (strict)"
completionStatus:
  gateDecision: pass
```

Blocked example:
```yaml
completionStatus:
  gateDecision: failed
notes:
  - "verification-evidence-gate: blocked (missing fresh evidence)"
missingInfo:
  - category: verification-evidence
    priority: HIGH
    question: "Please run and report the required verification command output before completion."
    reason: "Strict profile requires evidence before completion claims."
```

## Rules
- Do not claim success when this gate is blocked.
- Do not accept stale or inferred verification.
- This gate is policy-only and does not edit source code.
