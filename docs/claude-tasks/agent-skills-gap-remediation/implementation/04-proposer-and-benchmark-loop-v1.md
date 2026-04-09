# Phase 04: Proposer And Benchmark Loop (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-7 | work-plan Part B.9, B.10, B.11, B.12, B.14, B.15 | Add proposer loop, recovery playbooks, benchmark scoring, and safe optimization boundary | Build bounded meta-harness optimizer |

## Goal
- Allow the harness to inspect prior traces, propose harness-local improvements, and evaluate them against measurable benchmark signals.

## Expected Outcome
- bounded proposer loop exists
- recovery playbooks are injectable by failure mode
- candidate revisions can be benchmarked safely

## Scope
- In scope:
  - diagnoser/proposer loop
  - recovery playbook injection
  - benchmark runner
  - optimization boundary rules
- Out of scope:
  - unrestricted self-modifying behavior

## Preconditions and Inputs
- Required docs:
  - `.claude/docs/tasks/agent-skills-gap-remediation/implementation/03-trace-and-diagnosis-substrate-v1.md`

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Add diagnoser/proposer loop | 1) analyze traces 2) generate bounded harness patches 3) summarize rationale | Harness can propose bounded improvements from trace bundles |
| P04-2 | Add benchmark scoring | 1) score candidate revisions 2) compare against baseline metrics | Candidate harness revisions are rankable |
| P04-3 | Enforce safety boundary | 1) document optimizer scope 2) block out-of-scope mutations | Optimizer remains limited to harness-owned files |

## Validation Plan
- [ ] Behavior checks: proposer output is bounded to harness-owned files
- [ ] Regression checks: benchmark run can compare at least baseline vs candidate

## Evidence to Mark Done
- proposer outputs
- benchmark results
- optimization boundary docs

## Deliverables
- proposer, benchmark, and optimization-boundary assets

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- None. This is the final planned phase for the current initiative.
