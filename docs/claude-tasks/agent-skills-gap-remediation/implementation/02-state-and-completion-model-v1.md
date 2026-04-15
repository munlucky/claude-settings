# Phase 02: State And Completion Model (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-3 | work-plan Part A.3 and A.7 | Separate planning/execution readiness and normalize completion states | Add explicit readiness and completion model |
| SRC-4 | work-plan Part A.4 | Make phase evidence a first-class artifact model | Introduce canonical workflow state artifact |
| SRC-5 | work-plan Part A.5 | Shrink prompt-time contract injection | Move reusable coordinator contract text into a template asset |

## Goal
- Replace mixed readiness and closeout inference with an explicit state model built on canonical contracts.

## Expected Outcome
- readiness split is explicit
- completion states are normalized
- workflow evidence has one canonical machine-readable home

## Scope
- In scope:
  - readiness state model
  - completion state model
  - dispatcher contract cleanup
- Out of scope:
  - proposer loop
  - benchmark scoring

## Preconditions and Inputs
- Required docs:
  - `.claude/docs/tasks/agent-skills-gap-remediation/implementation/00-master-plan-v1.md`
  - `.claude/docs/tasks/agent-skills-gap-remediation/implementation/01-contract-extraction-v1.md`

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Split readiness model | 1) Add `planningReady`/`executionReady` contract 2) update consumers | Readiness no longer relies on mixed booleans only |
| P02-2 | Normalize completion | 1) define canonical completion states 2) align phase-state logic | Completion is represented by explicit states |
| P02-3 | Centralize workflow evidence | 1) add current-run artifact 2) reduce markdown reconstruction dependence | Canonical evidence artifact exists and is consumed |

## Validation Plan
- [ ] Behavior checks: phase completion logic still enforces review/verify/finish order
- [ ] Regression checks: QA/HANDOFF markdown remains supported

## Evidence to Mark Done
- updated state/evidence scripts
- updated dispatcher contract asset

## Deliverables
- updated state and workflow enforcement scripts
- execution contract asset

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 03 depends on the canonical workflow state artifact from this phase.
