# Claude Settings Workflow Master Plan v1

> This document is the plan of all plans for the next workflow architecture revision.

## Source Baseline
- `user-request: 2026-03-11 workflow improvement discussion` (role: scope/priority)
- `README.md` (role: product baseline)
- `.claude/skills/moonshot-orchestrator/SKILL.md` (role: orchestration contract)
- `.claude/skills/moonshot-decide-sequence/SKILL.md` (role: chain selection contract)
- `.claude/skills/pre-flight-check/SKILL.md` (role: preflight and readiness contract)
- `.claude/skills/project-md-refresh/SKILL.md` (role: project bootstrap contract)
- `.claude/agents/context-builder.md` (role: task context plan contract)
- `.claude/skills/completion-verifier/SKILL.md` (role: completion and evidence contract)
- `.claude/skills/failure-analyzer/SKILL.md` (role: meta feedback contract)
- `.claude/skills/workflow-self-improver/SKILL.md` (role: meta improvement contract)

## Objective
- Refactor the current skill workflow so this repository acts as a reusable control plane for downstream projects.
- Separate generation skills from readiness gates.
- Add explicit routing for `meta_harness` work versus downstream product-project work.
- Keep `moonshot-orchestrator` as the default entry point for code work without forcing it on explicit direct-skill and read-only flows.

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Execution Plane and Routing | `docs/implementation/01-execution-plane-and-routing-v1.md` | - |
| 02 | Readiness Gates and Bootstrap | `docs/implementation/02-readiness-gates-and-bootstrap-v1.md` | 01 |
| 03 | Verification Contract and Harness | `docs/implementation/03-verification-contract-and-harness-v1.md` | 01, 02 |
| 04 | Feedback Loop and Adoption Policy | `docs/implementation/04-feedback-loop-and-adoption-policy-v1.md` | 01, 02, 03 |

## Execution Order Notes
- Phase 01 must land first because every later phase depends on clearer routing semantics.
- Phase 02 adds gate-only skills and auto-injection policy on top of the Phase 01 routing model.
- Phase 03 formalizes project-level verification contracts after gate prerequisites are defined.
- Phase 04 updates the failure feedback loop, rollout policy, and direct-skill exception policy after the new workflow shape is stable.

## Source Traceability Matrix
| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|--------|---------------------|-------|-----------|--------|
| REQ-1 | user-request | Improve the full skill workflow for this repository, not one project template | 01 | `docs/implementation/01-execution-plane-and-routing-v1.md` | mapped |
| REQ-2 | user-request | Support real projects in creating usable `PROJECT.md` and `context.md` instead of mutating this repository as if it were the target project | 02 | `docs/implementation/02-readiness-gates-and-bootstrap-v1.md` | mapped |
| REQ-3 | user-request | Evaluate the risk of always forcing `moonshot-orchestrator` and preserve direct invocation where appropriate | 01 | `docs/implementation/01-execution-plane-and-routing-v1.md` | mapped |
| REQ-4 | user-request | Produce concrete file-level improvement guidance, not only abstract recommendations | 01 | `docs/implementation/01-execution-plane-and-routing-v1.md` | mapped |
| SRC-5 | `README.md` | Repository distributes reusable rules, skills, and templates to other projects | 01 | `docs/implementation/01-execution-plane-and-routing-v1.md` | mapped |
| SRC-6 | `.claude/skills/moonshot-orchestrator/SKILL.md` | Orchestrator owns chain execution, dynamic skill injection, and workflow profile handling | 01 | `docs/implementation/01-execution-plane-and-routing-v1.md` | mapped |
| SRC-7 | `.claude/skills/moonshot-decide-sequence/SKILL.md` | Current chain logic is complexity-based and can be simplified into bundles | 01 | `docs/implementation/01-execution-plane-and-routing-v1.md` | mapped |
| SRC-8 | `.claude/skills/pre-flight-check/SKILL.md` | Pre-flight currently reports warnings but does not emit strong readiness signals | 02 | `docs/implementation/02-readiness-gates-and-bootstrap-v1.md` | mapped |
| SRC-9 | `.claude/skills/project-md-refresh/SKILL.md` | Existing project bootstrap exists but is not framed as a gate-driven dependency | 02 | `docs/implementation/02-readiness-gates-and-bootstrap-v1.md` | mapped |
| SRC-10 | `.claude/agents/context-builder.md` | Existing context plan generator exists but is not guarded by minimal readiness requirements | 02 | `docs/implementation/02-readiness-gates-and-bootstrap-v1.md` | mapped |
| SRC-11 | `.claude/skills/completion-verifier/SKILL.md` | Verification rules need a stable project-level contract and clearer indeterminate handling | 03 | `docs/implementation/03-verification-contract-and-harness-v1.md` | mapped |
| SRC-12 | `.claude/skills/failure-analyzer/SKILL.md` | Failure analysis should detect routing mismatch and missing readiness contracts | 04 | `docs/implementation/04-feedback-loop-and-adoption-policy-v1.md` | mapped |
| SRC-13 | `.claude/skills/workflow-self-improver/SKILL.md` | Workflow self-improvement should handle gate and contract documents as first-class targets | 04 | `docs/implementation/04-feedback-loop-and-adoption-policy-v1.md` | mapped |

## Unmapped Source Requirements
- None.

## Phase Completion Checklist
- [x] Phase 01 - Execution Plane and Routing (`docs/implementation/01-execution-plane-and-routing-v1.md`)
- [x] Phase 02 - Readiness Gates and Bootstrap (`docs/implementation/02-readiness-gates-and-bootstrap-v1.md`)
- [x] Phase 03 - Verification Contract and Harness (`docs/implementation/03-verification-contract-and-harness-v1.md`)
- [x] Phase 04 - Feedback Loop and Adoption Policy (`docs/implementation/04-feedback-loop-and-adoption-policy-v1.md`)

## Completion Rule
- Master checklist items above track plan artifact readiness only.
- Execution status is tracked inside each phase plan's implementation exit criteria and validation sections.
- Do not treat the architecture migration as complete until every phase plan is implemented and verified in repository changes.
