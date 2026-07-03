# Meta-Harness Strategy Validation

Date: 2026-07-03

This package validates whether ideas from Meta-Harness are likely to improve Moonshot Relay's harness-lab workflow. It is an architecture and research validation package, not an implementation patch.

## Package Contents

- `ARCHITECTURE_BRIEF.md`: conclusion, mode classification, current fit.
- `REQUIREMENT_INVENTORY.md`: accepted and rejected requirements.
- `ASR_CATALOG.md`: quality scenarios and architecture-significant requirements.
- `ARCHITECTURE_OPTIONS.md`: adoption options.
- `TRADEOFF_ANALYSIS.md`: feature-by-feature validation matrix.
- `SPEC_DELTA.md`: source-surface deltas for a later implementation plan.
- `PLAN.md`: phased handoff plan.
- `TRACEABILITY_MATRIX.md`: requirement to owner and verification mapping.
- `ARCHITECTURE_REVIEW.md`: gate review and independent review summary.
- `ADR/`: decision records.
- `C4/`: context and component boundaries.
- `planning-loop/`: review evidence.

## Decision

Adopt the Meta-Harness mechanics that strengthen evidence navigation and proposal discipline:

- failure-rich search fixtures
- fail-soft environment snapshots
- generated experience index over existing lab artifacts
- read-only history query CLI
- `lab:evolve` proposal artifacts with consulted evidence
- advisory frontier reporting after history data exists

Defer autonomous source mutation and unrestricted proposer access. Keep H0 `external-bootstrap-lab` as the only promotion authority.
