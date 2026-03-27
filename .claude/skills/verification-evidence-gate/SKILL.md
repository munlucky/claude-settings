---
name: verification-evidence-gate
description: Block completion claims in strict runs when fresh verification evidence is missing.
---

# Verification Evidence Gate

## Role
Enforce evidence-before-completion in strict profile execution.

This closes the Verify stage in strict runs before Finish / Handoff can begin.

## When to use
- After `completion-verifier` (or fallback verification in simple flow).
- Immediately before any "complete/passed/fixed" statement.

## Inputs
- `analysisContext.signals.workflowProfile`
- `analysisContext.signals.allowIndeterminate`
- `completionStatus.*` (if present)
- `analysisContext.notes`
- `analysisContext.artifacts.verificationContractPath`
- Latest verifier verdict artifact, especially `verdict.workflowEvidence.*`

## Gate logic
1. If `workflowProfile != strict`: return pass with note.
2. For `strict`, require fresh evidence:
   - Preferred: `completionStatus.verificationState == passed`.
   - Also require `completionStatus.evidenceFresh == true` when present.
   - Prefer verifier artifact evidence over free-form notes when both exist.
   - Fallback: notes contain explicit current-run success evidence for contract-defined verification command outputs.
3. Hard block conditions:
   - `verificationState == failed`
   - `verificationState == indeterminate`
   - `contractApplicable == true` and `requiredChecks.missing` is not empty
   - `verificationMode == contract` and `requiredChecks.missing` is not empty
   - `evidenceFresh == false` when a contract-backed verdict is expected
   - `completionStatus.traceability.uncoveredRequirements` is not empty for in-scope `REQ-*`
   - `completionStatus.traceability.scenariosMissingEvidence` is not empty for critical `SCN-*`
   - `completionStatus.traceability.uatReady == false` for user-facing finish claims
   - `verdict.workflowEvidence.warnings` is not empty for code-changing closeout work
   - verifier artifact says `workflowEvidence.detected == false` for bounded-direct closeout that claims review/finish completion
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
- Prefer contract-defined artifact paths and verdict files when available.
- Prefer structured `verdict.workflowEvidence` warnings over manual interpretation when they exist.
- For contract-backed verification, a passing state without fresh evidence is still blocked.
- For code-changing closeout, missing review/finish workflow evidence is treated as missing verification evidence, not as optional metadata.
- In document-trace runs, missing requirement or critical-scenario evidence is also missing verification evidence.
