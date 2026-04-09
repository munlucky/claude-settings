# Agent Skills Gap Remediation Master Plan v1

> Phase-based execution package for workflow and meta-harness improvements.

## Source Baseline
- `.claude/docs/tasks/agent-skills-gap-remediation/work-plan.md` (role: scope and sequencing)
- `.claude/docs/tasks/agent-skills-gap-remediation/ASSUMPTIONS.md` (role: planning assumptions)
- `.claude/skills/moonshot-phase-runner/SKILL.md` (role: execution contract)

## Objective
- Evolve the harness in bounded phases: first centralize workflow contracts, then normalize state/evidence, then add trace/diagnosis infrastructure, and finally add bounded proposer/benchmark loops.

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Contract Extraction | `.claude/docs/tasks/agent-skills-gap-remediation/implementation/01-contract-extraction-v1.md` | - |
| 02 | State And Completion Model | `.claude/docs/tasks/agent-skills-gap-remediation/implementation/02-state-and-completion-model-v1.md` | 01 |
| 03 | Trace And Diagnosis Substrate | `.claude/docs/tasks/agent-skills-gap-remediation/implementation/03-trace-and-diagnosis-substrate-v1.md` | 02 |
| 04 | Proposer And Benchmark Loop | `.claude/docs/tasks/agent-skills-gap-remediation/implementation/04-proposer-and-benchmark-loop-v1.md` | 03 |

## Execution Order Notes
- Phase 01 is behavior-preserving extraction only.
- Phase 02 may change internal state handling but should preserve current user-facing entrypoints.
- Phase 03 introduces new artifacts without enabling self-modification yet.
- Phase 04 is bounded to harness-owned files and depends on the trace substrate from Phase 03.

## Source Traceability Matrix
| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|--------|---------------------|-------|-----------|--------|
| SRC-1 | work-plan Part A | Extract `analysisContext` into a canonical contract | 01 | `.claude/docs/tasks/agent-skills-gap-remediation/implementation/01-contract-extraction-v1.md` | mapped |
| SRC-2 | work-plan Part A | Move bundle routing rules into a shared registry | 01 | `.claude/docs/tasks/agent-skills-gap-remediation/implementation/01-contract-extraction-v1.md` | mapped |
| SRC-3 | work-plan Part A | Normalize planning/execution readiness and completion semantics | 02 | `.claude/docs/tasks/agent-skills-gap-remediation/implementation/02-state-and-completion-model-v1.md` | mapped |
| SRC-4 | work-plan Part A | Promote workflow evidence to a first-class machine-readable artifact | 02 | `.claude/docs/tasks/agent-skills-gap-remediation/implementation/02-state-and-completion-model-v1.md` | mapped |
| SRC-5 | work-plan Part A | Slim prompt-time contract injection in phase dispatch | 02 | `.claude/docs/tasks/agent-skills-gap-remediation/implementation/02-state-and-completion-model-v1.md` | mapped |
| SRC-6 | work-plan Part B | Build trace corpus and diagnosis-ready views for each harness attempt | 03 | `.claude/docs/tasks/agent-skills-gap-remediation/implementation/03-trace-and-diagnosis-substrate-v1.md` | mapped |
| SRC-7 | work-plan Part B | Add proposer/diagnoser loop, recovery playbooks, and benchmark scoring | 04 | `.claude/docs/tasks/agent-skills-gap-remediation/implementation/04-proposer-and-benchmark-loop-v1.md` | mapped |

## Unmapped Source Requirements
- none

## Phase Completion Checklist
- [x] Phase 01 - Contract Extraction (`.claude/docs/tasks/agent-skills-gap-remediation/implementation/01-contract-extraction-v1.md`)
- [x] Phase 02 - State And Completion Model (`.claude/docs/tasks/agent-skills-gap-remediation/implementation/02-state-and-completion-model-v1.md`)
- [x] Phase 03 - Trace And Diagnosis Substrate (`.claude/docs/tasks/agent-skills-gap-remediation/implementation/03-trace-and-diagnosis-substrate-v1.md`)
- [x] Phase 04 - Proposer And Benchmark Loop (`.claude/docs/tasks/agent-skills-gap-remediation/implementation/04-proposer-and-benchmark-loop-v1.md`)

## Completion Rule
- Mark a phase as checked only when its phase plan completion criteria are satisfied.
- Do not start the proposer loop before the trace substrate and safe optimization boundary are present.
- Do not declare the initiative complete until every phase checklist item is checked.

## Initiative Closeout
- Phase status: `.claude/docs/tasks/agent-skills-gap-remediation/phase-status.yaml`
- Phase runner result: `.claude/docs/tasks/agent-skills-gap-remediation/phase-runner-result.yaml`
- Final summary: `.claude/docs/tasks/agent-skills-gap-remediation/INITIATIVE_CLOSEOUT.md`
