# TASK

## Summary
- Slice name: Security boundaries and ignore policy
- Goal: Expand security guidance into explicit tool/path boundaries and define an ignore strategy for sensitive or unnecessary agent context
- Requirement IDs (`REQ-*`): `REQ-HH-4`
- Scenario IDs (`SCN-*`): `SCN-HH-4`

## Input
- `docs/implementation/05-harness-gap-hardening-review-plan-v1.md`
- `.claude/rules/security.md`
- `.gitignore`
- output of Package 02 policy naming
- any existing sensitive artifact paths in `.claude/`

## Output
- Security rules define protected path categories and external execution rules
- The repository has first-class ignore guidance via `.claudeignore` or an equivalent documented policy

## Scope
- Impacted user flow: agent context loading, tool use, external content handling
- Impacted systems or modules:
  - security rules
  - ignore/path policy
  - repository hygiene docs

## Dependencies
- Upstream prerequisites:
  - [02-policy-set-model.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/02-policy-set-model.md)
- Blocking conditions:
  - unresolved decision on whether `.claudeignore` should be introduced as a real file or a documented equivalent only

## Parallelization
- Parallelizable: Yes
- Parallel group: `G2`

## Done Criteria
- Security docs define sensitive-path categories and deny-by-default examples
- External downloads/execution rules are concrete, not generic
- Ignore strategy exists and is discoverable from core docs
- The policy does not conflict with existing `.gitignore` and audit behavior

## Verification
- Required tests or checks:
  - `bash .claude/scripts/knowledge-repo-audit.sh`
  - manual review of ignore-path examples against repo structure
- Evidence paths or artifacts to refresh:
  - security rule file
  - ignore guidance or new ignore file
  - linked guideline updates

## Contract Seed
- Round goal:
  - make security and context boundaries explicit enough for agent operation
- Explicit non-goals:
  - no secret scanning platform integration
  - no enterprise IAM or vault integration
- Hard fail conditions:
  - sensitive path policy remains generic
  - ignore strategy is undocumented or contradictory
- Evaluator focus:
  - path examples
  - deny-by-default clarity
  - consistency with repo layout
- Expected evidence:
  - updated security/ignore docs with explicit examples

## Handoff Notes
- Package 05 should reference any finalized ignore policy if it affects the repo contract.

## Rollback / Risk
- Blast radius:
  - documentation and context-control policy
- Safe fallback:
  - keep expanded security text but remove any ignore mechanism that conflicts with tooling
