---
name: verification-contract-gate
description: Checks whether a downstream project has enough verification contract information and blocks strict completion when it does not.
---

# Verification Contract Gate

## Role
Ensure downstream projects declare enough verification intent before completion claims are trusted.

## When to use
- `executionPlane == product_project`
- Before `completion-verifier` or fallback shell verification is treated as authoritative

## Inputs
- `analysisContext.signals.executionPlane`
- `analysisContext.signals.verificationContractReady`
- `analysisContext.signals.workflowProfile`
- `analysisContext.artifacts.verificationContractPath`

## Gate logic
1. If `executionPlane != product_project`, return pass with note.
2. If `verificationContractReady == true`, return pass.
3. If `workflowProfile == standard`, return `pass_with_warning` and recommend adding a contract.
4. If `workflowProfile == strict`, block until the contract exists or project policy explicitly defines equivalent verification rules.

## Minimum Verification Contract Areas
- Required commands
- Required evidence artifacts
- Runtime verification policy
- Indeterminate handling policy
- Strict-mode triggers

## Output (patch)
```yaml
notes:
  - "verification-contract-gate: blocked in strict mode"
missingInfo:
  - category: verification-contract
    priority: HIGH
    question: "Add `.claude/verification.contract.yaml` or equivalent project verification policy before completion."
completionStatus:
  gateDecision: failed
```

## Rules
- This gate does not run tests by itself.
- It only validates that downstream verification expectations are declared clearly enough.
