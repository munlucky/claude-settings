# REQUIREMENTS TRACEABILITY

## Usage
- One row per requirement (`REQ-*`)
- Keep IDs stable across planning, implementation, verification, and handoff
- Do not mark a row complete without evidence

| Requirement ID | Source Doc | Summary | Slice | Implementation Status | Verification Path | Evidence | Blocker |
|----------------|------------|---------|-------|-----------------------|-------------------|----------|---------|
| REQ-001 | docs/implementation/moonshot-harness-waste-reduction-2026-05-06/01-path-authority-fail-fast-v1.md | Path authority failures fail before worker launch | Phase 01 | verified | `bash .claude/scripts/verify-phase-runner-boundary.sh` | boundary smoke passed; `path-authority-preflight-failed` recorded before any worker prompt launch | none |
| REQ-002 | docs/implementation/moonshot-harness-waste-reduction-2026-05-06/01-path-authority-fail-fast-v1.md | No default master plan fallback during phase closeout | Phase 01 | verified | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | closeout tests passed; explicit supplied master plan and missing default fallback remain distinguishable | none |

## Coverage Rules
- Every in-scope `REQ-*` has a slice owner
- Every user-visible `REQ-*` maps to at least one `SCN-*`
- `verified` requires current evidence, not intention
- Blocked items stay open in `QA_REPORT.md` and `HANDOFF.md`
