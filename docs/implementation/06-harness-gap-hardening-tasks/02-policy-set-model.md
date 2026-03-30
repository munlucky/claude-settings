# TASK

## Summary
- Slice name: Repository-local policy-set model
- Goal: Introduce named policy groups so local script enforcement becomes more declarative and easier to map to future external governance
- Requirement IDs (`REQ-*`): `REQ-HH-3`
- Scenario IDs (`SCN-*`): `SCN-HH-3`

## Input
- `docs/implementation/05-harness-gap-hardening-review-plan-v1.md`
- `.claude/verification.contract.yaml`
- `.claude/docs/guidelines/verification-contract.md`
- `.claude/scripts/verify-code-policy.sh`
- `.claude/docs/guidelines/knowledge-repository-ops.md`

## Output
- A documented local policy-set model for this repository
- Verification/governance docs refer to named policy groups where practical

## Scope
- Impacted user flow: local governance definition and verification interpretation
- Impacted systems or modules:
  - verification contract
  - policy documentation
  - code policy script terminology

## Dependencies
- Upstream prerequisites:
  - [01-decision-rubric-and-plan-approval.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/01-decision-rubric-and-plan-approval.md)
- Blocking conditions:
  - unresolved disagreement about whether policy sets are documentation-only or need script-level references now

## Parallelization
- Parallelizable: Yes
- Parallel group: `G2`

## Done Criteria
- A reader can identify named policy groups such as knowledge/workflow/verification/security
- The contract explains that these are local policy sets, not enterprise engine integration
- Verification and policy docs use the same vocabulary for the named groups
- The future mapping to external policy engines is documented as deferred, not implemented

## Verification
- Required tests or checks:
  - `bash .claude/scripts/knowledge-repo-audit.sh`
  - `bash -n .claude/scripts/verify-code-policy.sh`
- Evidence paths or artifacts to refresh:
  - verification contract
  - policy-model guideline updates

## Contract Seed
- Round goal:
  - replace raw check lists with a clearer local governance model
- Explicit non-goals:
  - no OPA, Rego, or external policy engine integration
  - no hosted policy dashboard
- Hard fail conditions:
  - docs imply enterprise integration already exists
  - policy names diverge across contract and guideline files
- Evaluator focus:
  - vocabulary consistency
  - whether the policy model is still machine-check-friendly
- Expected evidence:
  - aligned contract/guideline diff with named policy groups

## Handoff Notes
- Package 03 and Package 04 should reuse the policy group names defined here.

## Rollback / Risk
- Blast radius:
  - governance docs and script terminology
- Safe fallback:
  - revert to command-list wording while preserving any clarified comments
