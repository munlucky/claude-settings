---
name: verification-evidence-gate
description: Block completion claims in strict runs when fresh verification evidence is missing.
---

# Verification Evidence Gate

## Role
Deprecated compatibility shim for strict evidence-before-completion policy.

Active strict evidence policy is owned by `completion-verifier`, `scripts/verification-plane.mjs`, `scripts/lib/verification-plane.mjs`, and `scripts/runtime-state.mjs assess-completion`. New workflow defaults do not insert this skill directly.

## When to use
- Only for legacy compatibility when an older bundle explicitly calls `verification-evidence-gate`.
- Prefer `completion-verifier` for current Verify stage assembly.

## Inputs
- `analysisContext.signals.workflowProfile`
- `analysisContext.signals.allowIndeterminate`
- `completionStatus.*` (if present)
- `analysisContext.notes`
- `analysisContext.artifacts.verificationContractPath`
- Latest verifier verdict artifact, especially `verdict.workflowEvidence.*`

## Gate logic
1. If invoked, delegate policy evaluation to the current `completion-verifier` output.
2. Treat `completionStatus.gateDecision != pass`, stale evidence, or missing required checks as blocked.
3. Do not create an independent completion authority decision from this shim.

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
- Do not duplicate completion-verifier, verification-plane, or runtime-state policy here.
- Do not accept stale or inferred verification.
- This gate is policy-only and does not edit source code.
