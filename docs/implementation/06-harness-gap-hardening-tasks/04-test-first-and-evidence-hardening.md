# TASK

## Summary
- Slice name: Test-first and completion evidence hardening
- Goal: Strengthen test-first, regression, and completion-evidence expectations without over-blocking doc-only or low-risk harness edits
- Requirement IDs (`REQ-*`): `REQ-HH-5`
- Scenario IDs (`SCN-*`): `SCN-HH-5`

## Input
- `docs/implementation/05-harness-gap-hardening-review-plan-v1.md`
- `.claude/rules/testing.md`
- `.claude/rules/workflow.md`
- `.claude/skills/implementation-runner/SKILL.md`
- `.claude/skills/completion-verifier/SKILL.md`
- `.claude/verification.contract.yaml`
- output of Package 02 policy naming

## Output
- Testing and completion rules distinguish low-risk doc/rule edits from behavior-changing workflow changes
- Bugfix and logic-change guidance more strongly expects regression evidence when an environment exists

## Scope
- Impacted user flow: implementation, verification, and completion gating
- Impacted systems or modules:
  - testing rules
  - completion verifier guidance
  - workflow completion language
  - verification contract thresholds

## Dependencies
- Upstream prerequisites:
  - [01-decision-rubric-and-plan-approval.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/01-decision-rubric-and-plan-approval.md)
  - [02-policy-set-model.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/02-policy-set-model.md)
- Blocking conditions:
  - disagreement on what counts as behavior-changing harness logic

## Parallelization
- Parallelizable: Yes
- Parallel group: `G3`

## Done Criteria
- Testing rules classify change types instead of applying one rule to everything
- Completion logic more clearly penalizes missing evidence for behavior-changing work
- Bugfix guidance calls for regression proof when the environment supports it
- Doc-only changes remain lightweight and are not forced into fake test requirements

## Verification
- Required tests or checks:
  - `bash .claude/scripts/knowledge-repo-audit.sh`
  - `bash .claude/scripts/verify-code-policy.sh`
  - manual review of example change classes
- Evidence paths or artifacts to refresh:
  - testing rules
  - completion verifier skill doc
  - verification contract wording

## Contract Seed
- Round goal:
  - make evidence requirements stricter where behavior can regress, while keeping lightweight work practical
- Explicit non-goals:
  - no fake universal TDD claim for every doc edit
  - no app-test-stack assumptions for this repository
- Hard fail conditions:
  - low-risk doc-only work becomes unreasonably blocked
  - behavior-changing work can still close with self-audit by default
- Evaluator focus:
  - change classification clarity
  - regression expectation clarity
  - contract/verifier consistency
- Expected evidence:
  - aligned docs that distinguish risk classes and required evidence

## Handoff Notes
- Package 05 should import the final verification expectations into the filled project contract.

## Rollback / Risk
- Blast radius:
  - verification and completion policy
- Safe fallback:
  - keep clarified classification rules even if some blocking conditions need to be relaxed
