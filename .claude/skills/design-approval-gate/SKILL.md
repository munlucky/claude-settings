---
name: design-approval-gate
description: Strict workflow gate that blocks implementation until design/spec approval is explicit.
---

# Design Approval Gate

## Role
Prevent strict-profile execution from entering implementation without explicit design approval.

## When to use
- Immediately before the first implementation stage.
- Especially when `workflowProfile == strict`.

## Inputs
- `analysisContext.request.taskType`
- `analysisContext.signals.workflowProfile`
- `analysisContext.signals.hasContextMd`
- `analysisContext.signals.requirementsClear`
- `analysisContext.signals.hasPendingQuestions`
- `analysisContext.notes`

## Gate logic
1. If `workflowProfile != strict`: do not block; add note and return.
2. For `strict`, approve only if all are true:
   - `hasContextMd == true`
   - `requirementsClear == true`
   - `hasPendingQuestions == false`
3. Optional approval evidence from notes is allowed:
   - `"design-approved"` or `"spec-approved"` marker.
4. If approval is missing:
   - Set `signals.designApproved = false`
   - Set `signals.hasPendingQuestions = true`
   - Return phase recommendation `planning`

## Output (patch)
```yaml
signals:
  designApproved: true
  hasPendingQuestions: false
notes:
  - "design-approval-gate: passed (strict)"
```

Blocked example:
```yaml
phase: planning
signals:
  designApproved: false
  hasPendingQuestions: true
missingInfo:
  - category: design-approval
    priority: HIGH
    question: "Please confirm design/spec approval before implementation."
    reason: "Strict profile requires explicit design approval."
notes:
  - "design-approval-gate: blocked (missing approval evidence)"
```

## Rules
- This gate does not implement code.
- This gate does not force a file path convention.
- If blocked, return clear remediation steps and stop progression.
