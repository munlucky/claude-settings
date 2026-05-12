# <Project> Master Plan v<version>

> This document is the plan of all plans.

## Source Baseline
- `<source-doc-1.md>` (role: scope/priority)
- `<source-doc-2.md>` (role: technical contract)
- `<source-doc-3.md>` (role: experience/interaction)

## Objective
- <overall objective>

## Plan Quality Loop
```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: <n>
  isolationMode: "forked | unavailable"
  maxIterations: 4
  targetAmbiguityScore: 0.20
  blockedAmbiguityScore: 0.35
  totalScore: 0.0
  ambiguityScore: 1.0
  decision: "pass | revise | blocked | revise_exhausted"
  reviewerSessions: []
  writerSessions: []
  artifactRoot: "docs/implementation/planning-loop"
  latestReview: "docs/implementation/planning-loop/plan-quality-review-iter-<NN>.yaml"
  latestWriterRevision: "docs/implementation/planning-loop/plan-writer-revision-iter-<NN>.yaml"
  blockingFindings: []
  remainingImprovementDirectives: []
  remainingOpenDecisions: []
```

- Strict runnable readiness requires `ambiguityScore <= 0.20`, no blocking findings, no actionable improvement directives, and forked reviewer/writer evidence unless the user explicitly approves degraded isolation.
- Keep iteration artifacts under this plan package's `planning-loop/` directory.

## MVP Methodology
```yaml
mvpMethodology:
  profile: "none | demo_first"
  requiredExecutionPack:
    - MVP_SCOPE.md
    - MINI_ARCHITECTURE.md
    - UI_DEMO_PLAN.md
    - UI_FLOW_MAP.md
    - UI_STATE_MATRIX.md
    - MOCK_SCENARIOS.md
    - MOCK_API_CONTRACT.md
    - USER_DEMO_TEST.md
    - DEMO_EVIDENCE.md
    - USER_DEMO_APPROVAL.md
    - POST_DEMO_IMPLEMENTATION_PLAN.md
    - UI_CHANGE_REQUEST.md
```

- Use `demo_first` only when the MVP must hard-stop after clickable/mock demo evidence until user approval.
- For `demo_first`, every in-scope slice must progress through demo evidence, user approval, Real Functional, and Real Functional Verification before this plan can complete.

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | <title> | `docs/implementation/01-<slug>-v<version>.md` | - |

## Execution Order Notes
- <dependency and ordering notes>

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01, 02 | parallel | disjoint `ownedPaths`; no shared mutable writes |
| sequential | 03 | sequential | depends on wave-1 completion |

- Phase-level parallel execution is allowed only when each phase has explicit `Phase Execution Metadata`.
- Sequential phases must record the blocker reason instead of relying on implicit ordering.

## Source Traceability Matrix
| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|--------|---------------------|-------|-----------|--------|
| SRC-<n> | <source-name> | <summary> | <NN> | `docs/implementation/<NN>-<slug>-v<version>.md` | mapped |

## Unmapped Source Requirements
- <none or explicit gap list with reason>

## Phase Completion Checklist
- [ ] Phase 01 - <title> (`docs/implementation/01-<slug>-v<version>.md`)
- [ ] Phase 02 - <title> (`docs/implementation/02-<slug>-v<version>.md`)

## Completion Rule
- Mark a phase as checked only when its phase plan completion criteria are satisfied.
- Do not leave source requirements unmapped without explicit decision notes.
- Do not declare full completion until every checklist item is checked.
