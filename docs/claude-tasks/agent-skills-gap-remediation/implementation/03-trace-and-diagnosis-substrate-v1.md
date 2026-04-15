# Phase 03: Trace And Diagnosis Substrate (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-6 | work-plan Part B.8 and B.13 | Build trace corpus and trimmed diagnosis view | Add attempt trace bundle and saliency-based trimming |

## Goal
- Make every harness attempt diagnosable by machines and humans without re-parsing raw logs manually.

## Expected Outcome
- per-attempt trace bundle exists
- diagnosis view preserves failure context while compressing noise

## Scope
- In scope:
  - trace capture
  - trace manifest
  - saliency-based trimming
- Out of scope:
  - proposer-generated patches

## Preconditions and Inputs
- Required docs:
  - `.claude/docs/tasks/agent-skills-gap-remediation/implementation/02-state-and-completion-model-v1.md`

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Capture trace bundles | 1) define per-attempt trace layout 2) persist normalized metadata | Trace manifest exists per attempt |
| P03-2 | Add diagnosis view | 1) keep salient failure context 2) trim repetitive success noise | Diagnosis artifact is smaller and still actionable |

## Validation Plan
- [ ] Behavior checks: traces include stop reason, verifier result, and artifact deltas
- [ ] Regression checks: raw logs remain available

## Evidence to Mark Done
- trace bundle examples
- diagnosis view examples

## Deliverables
- meta-harness trace scripts and docs

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 04 should consume the new trace bundle and diagnosis view directly.
