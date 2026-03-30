# TASK

## Summary
- Slice name: Decision rubric and planning-only approval boundary
- Goal: Add an explicit value judgment rubric to planning gates and state that human approval ends when execution begins
- Requirement IDs (`REQ-*`): `REQ-HH-1`, `REQ-HH-2`
- Scenario IDs (`SCN-*`): `SCN-HH-1`, `SCN-HH-2`

## Input
- `docs/implementation/05-harness-gap-hardening-review-plan-v1.md`
- `.claude/skills/product-orchestrator/SKILL.md`
- `.claude/skills/product-gate-reviewer/SKILL.md`
- `.claude/docs/guidelines/product-definition-workflow.md`
- `.claude/rules/workflow.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`

## Output
- Planning docs and gate-owner skills use a value/scope rubric before implementation handoff
- Workflow docs state that post-start execution, verification, and retry loops do not require human checkpoints unless a true blocker appears

## Scope
- Impacted user flow: idea-to-plan intake, plan approval, execution boundary
- Impacted systems or modules:
  - product-definition workflow
  - gate reviewer policy
  - global workflow wording
  - orchestrator retry/verification loop language

## Dependencies
- Upstream prerequisites:
  - none
- Blocking conditions:
  - uncertainty about whether approval should be hard-required or optional at planning closeout

## Parallelization
- Parallelizable: No
- Parallel group: `G1`

## Done Criteria
- `PRODUCT_INTENT`, `PRD`, and `PLAN` stages define rubric criteria beyond completeness alone
- The docs show how low-value or over-scoped requests can be narrowed, held, or rejected
- Workflow/orchestrator docs clearly say human approval is bounded to planning only
- No remaining doc suggests human checkpoint insertion inside implementation -> verify -> retry loops

## Verification
- Required tests or checks:
  - `bash .claude/scripts/knowledge-repo-audit.sh`
  - manual grep/review for approval wording consistency
- Evidence paths or artifacts to refresh:
  - updated skill docs
  - updated workflow guide wording

## Contract Seed
- Round goal:
  - make planning gates judge value and scope explicitly, and make approval boundaries unambiguous
- Explicit non-goals:
  - no runtime approval UI
  - no new external review workflow
  - no ops telemetry work
- Hard fail conditions:
  - approval wording still appears inside execution or verification loops
  - rubric only measures completeness, not value/scope/cost
- Evaluator focus:
  - contradictions between product workflow and orchestrator docs
  - missing “do not build” or scope-reduction language
- Expected evidence:
  - diff showing rubric dimensions and approval-boundary wording in all relevant docs

## Handoff Notes
- Package 02 and Package 04 should assume the approval boundary defined here is final unless explicitly changed by review.

## Rollback / Risk
- Blast radius:
  - planning and workflow guidance only
- Safe fallback:
  - keep old gate behavior and remove only the new rubric wording if it proves contradictory
