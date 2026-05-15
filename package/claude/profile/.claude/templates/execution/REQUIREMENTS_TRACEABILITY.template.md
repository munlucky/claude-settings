# REQUIREMENTS TRACEABILITY

## Usage
- One row per requirement (`REQ-*`)
- Keep IDs stable across planning, implementation, verification, and handoff
- Do not mark a row complete without evidence

| Requirement ID | Source Doc | Summary | Slice | Implementation Status | Verification Path | Evidence | Blocker |
|----------------|------------|---------|-------|-----------------------|-------------------|----------|---------|
| REQ-001 | PRD.md#L |  |  | not_started / in_progress / implemented / verified | unit / integration / e2e / manual |  |  |

## Coverage Rules
- Every in-scope `REQ-*` must have a slice owner
- Every user-visible `REQ-*` should map to at least one `SCN-*`
- `verified` requires current evidence, not intention
- Blocked items stay open in `QA_REPORT.md` and `HANDOFF.md`
