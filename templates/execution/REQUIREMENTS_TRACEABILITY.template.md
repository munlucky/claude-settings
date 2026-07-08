# REQUIREMENTS TRACEABILITY

## Usage
- One row per requirement (`REQ-*`)
- Keep IDs stable across planning, implementation, verification, and handoff
- Do not mark a row complete without evidence

| Requirement ID | Source Doc | Summary | Slice | Implementation Status | verificationMode | interface | depth | environment | Required Command | Evidence Path | Status | Blocker |
|----------------|------------|---------|-------|-----------------------|------------------|-----------|-------|-------------|------------------|---------------|--------|---------|
| REQ-001 | PRD.md#L |  |  | not_started / in_progress / implemented / verified | tdd_red_green / characterization_first / evidence_mandatory / not_applicable | code / api / cli / ui / browser | unit / component / integration / ui_integration / e2e / broad_stack | hermetic / local / docker / preview / staging / canary |  |  | pending/pass/fail/not_applicable |  |

## Coverage Rules
- Every in-scope `REQ-*` must have a slice owner
- Every user-visible `REQ-*` should map to at least one `SCN-*`
- `verified` requires current evidence, not intention
- Blocked items stay open in `QA_REPORT.md` and `HANDOFF.md`
- Every in-scope `REQ-*` must map to a `specTestObligations` row in `SPRINT_CONTRACT.md`.
- Behavior-changing requirements default to `verificationMode: tdd_red_green`; `characterization_first` and `evidence_mandatory` require explicit evidence.
