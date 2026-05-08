# Frontend AI Harness MVP Master Plan v1

> This document turns the frontend AI coding methodology gap analysis into an executable harness improvement plan.

## Source Baseline
- User-provided methodology document: "프론트엔드 AI 코딩 작업을 위한 최적화 방법론" (role: target methodology)
- `.claude/verification.contract.yaml` (role: current verification contract)
- `.claude/agents/verification/verify-runtime.sh` (role: current runtime verifier)
- `.claude/tools/browserd/server.mjs` and `.claude/bin/browserctl` (role: current browser runtime)
- `.claude/templates/execution/SCORECARD.template.md` and `.claude/templates/execution/SCENARIO_MATRIX.template.md` (role: current execution artifacts)
- `.claude/docs/guidelines/verification-contract.ko.md` (role: downstream contract guide)

## Objective
- Upgrade the harness from generic runtime verification to a frontend-aware closed loop that can require, run, and score browser flow, visual, accessibility, and performance evidence before completion claims.
- Keep the MVP small by extending the existing contract and verifier path instead of adding a new orchestration surface.

## MVP Definition
The MVP is complete when a downstream frontend project can declare a critical UI scenario in `.claude/verification.contract.yaml`, run the harness verifier, and receive a structured verdict that distinguishes:
- URL/runtime health
- browser flow depth
- visual screenshot evidence
- accessibility evidence
- performance evidence or an explicit setup gap
- scorecard and scenario matrix evidence readiness

## Non-Goals
- Do not build a full visual regression SaaS replacement.
- Do not require Storybook, axe, or Lighthouse in every repository by default.
- Do not infer human UAT completion from automation.
- Do not replace Playwright project-owned E2E tests; integrate them as evidence.

## MVP Methodology
```yaml
mvpMethodology:
  profile: "none"
  executionShape: "contract_first_runtime_mvp"
  maturityTargets:
    - contract_declared
    - browser_flow_executed
    - frontend_evidence_gated
```

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Frontend Verification Contract MVP | `docs/implementation/frontend-ai-harness-mvp-2026-05-08/01-frontend-verification-contract-mvp-v1.md` | - |
| 02 | Browser Flow Runner MVP | `docs/implementation/frontend-ai-harness-mvp-2026-05-08/02-browser-flow-runner-mvp-v1.md` | 01 |
| 03 | Frontend Evidence Gates and Scorecard MVP | `docs/implementation/frontend-ai-harness-mvp-2026-05-08/03-frontend-evidence-gates-scorecard-mvp-v1.md` | 01, 02 |
| 04 | Visual Diff Gate Post-MVP | `docs/implementation/frontend-ai-harness-mvp-2026-05-08/04-visual-diff-gate-post-mvp-v1.md` | 01, 02, 03 |

## Execution Order Notes
- Phase 01 must land first because it defines the schema and docs that Phase 02 reads.
- Phase 02 should stay runtime-focused and write structured artifacts without deciding final task completion.
- Phase 03 owns completion semantics by teaching templates, scorecards, and verifier gates how to consume frontend evidence.
- Phase 04 is post-MVP. It should start only after the MVP path can already capture screenshot evidence and block missing required visual evidence.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | Schema/docs baseline before runner implementation |
| wave-2 | 02 | sequential | Depends on Phase 01 contract fields |
| wave-3 | 03 | sequential | Depends on Phase 02 verdict shape |
| post-mvp | 04 | sequential | Depends on MVP screenshot evidence and scorecard semantics |

## Source Traceability Matrix
| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|--------|---------------------|-------|-----------|--------|
| SRC-001 | Methodology executive summary | Use closed-loop frontend verification instead of draft-only generation | 01, 02, 03 | all phase files | mapped |
| SRC-002 | Methodology implementation guide | Declare unit/story/E2E/visual/a11y/perf/policy checks | 01 | `01-frontend-verification-contract-mvp-v1.md` | mapped |
| SRC-003 | Methodology browser verification | Prefer DOM/accessibility automation and screenshots for hard visual cases | 02 | `02-browser-flow-runner-mvp-v1.md` | mapped |
| SRC-004 | Methodology visual regression | Store screenshots, baselines, diffs, and breakpoint evidence | 02, 03, 04 | `02-browser-flow-runner-mvp-v1.md`, `03-frontend-evidence-gates-scorecard-mvp-v1.md`, `04-visual-diff-gate-post-mvp-v1.md` | mapped |
| SRC-005 | Methodology a11y/perf gate | Treat accessibility and performance as gates, not polish-only checks | 01, 03 | `01-frontend-verification-contract-mvp-v1.md`, `03-frontend-evidence-gates-scorecard-mvp-v1.md` | mapped |
| SRC-006 | Current harness contract | Preserve fresh evidence and scorecard completion discipline | 03 | `03-frontend-evidence-gates-scorecard-mvp-v1.md` | mapped |
| SRC-007 | Current browserd runtime | Reuse `browserctl`/Playwright instead of introducing a second browser runtime | 02 | `02-browser-flow-runner-mvp-v1.md` | mapped |

## Unmapped Source Requirements
- Full preview deploy, canary, rollback, A/B experimentation, and RUM feedback are intentionally deferred to post-MVP because they require project-specific hosting and observability integrations.
- Full Storybook state-source enforcement is deferred to post-MVP; Phase 01 leaves contract fields ready for optional Storybook commands.

## Phase Completion Checklist
- [x] Phase 01 - frontend verification contract MVP
- [x] Phase 02 - browser flow runner MVP
- [x] Phase 03 - frontend evidence gates and scorecard MVP
- [x] Phase 04 - visual diff gate post-MVP

## MVP Completion Checklist
- [x] Phase 01 - frontend verification contract MVP
- [x] Phase 02 - browser flow runner MVP
- [x] Phase 03 - frontend evidence gates and scorecard MVP

## Post-MVP Extension Checklist
- [x] Phase 04 - visual diff gate post-MVP

## Runnable Package Preparation
- Prepared status: ready
- Prepared at: 2026-05-08T02:06:24Z
- Status file: `.claude/docs/phase-status.yaml`
- Execution root: `docs/implementation/frontend-ai-harness-mvp-2026-05-08/execution/frontend-ai-harness-mvp-v1`
- Archived stale harness pointers: `docs/implementation/frontend-ai-harness-mvp-2026-05-08/archive/2026-05-08-before-v1-harness-state`
- Active phase after preparation: Phase 01 - Frontend Verification Contract MVP
- Planned phases after preparation: 4

## Completion Rule
- Do not declare this MVP complete until all three MVP phases have passed their phase completion checklist.
- Do not declare the full plan directory complete until Phase 04 and final git closeout have also passed.
- Do not mark critical frontend scenarios complete with URL health or smoke-only evidence when the contract requires visual, accessibility, or performance evidence.
- Setup gaps are acceptable only when they are explicit in verdict artifacts and block strong completion claims according to profile.
