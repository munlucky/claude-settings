# Brownfield Objective Fixture

## Existing Objective

Add reviewer audit notes to the existing approval flow without changing the current request submission API.

## Requirements

| Requirement ID | Requirement | Compatibility Constraint |
|---|---|---|
| REQ-101 | Reviewer decisions must append an audit event containing reviewer id, decision, and note. | Preserve `submitApprovalRequest` input and output contract. |
