# TASK

## Summary
- Slice name: Meta-harness project contract
- Goal: Replace the repository's template-only `PROJECT.md` state with a real operating contract for maintaining this harness
- Requirement IDs (`REQ-*`): `REQ-HH-6`
- Scenario IDs (`SCN-*`): `SCN-HH-6`

## Input
- `docs/implementation/05-harness-gap-hardening-review-plan-v1.md`
- `.claude/PROJECT.md`
- `.claude/PROJECT.ko.md`
- `.claude/README.md`
- Package 01 decision/approval boundary
- any finalized outputs from Packages 03 and 04 that affect commands or verification

## Output
- English and Korean `PROJECT.md` files describe this repository as a meta-harness project with real commands, structure, boundaries, and verification rules

## Scope
- Impacted user flow: maintainers operating this repository directly
- Impacted systems or modules:
  - project contract
  - repo usage documentation
  - self-host maintenance guidance

## Dependencies
- Upstream prerequisites:
  - [01-decision-rubric-and-plan-approval.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/01-decision-rubric-and-plan-approval.md)
- Blocking conditions:
  - major unresolved changes to verification or security rules that would immediately invalidate the new contract

## Parallelization
- Parallelizable: Yes
- Parallel group: `G4`

## Done Criteria
- `PROJECT.md` no longer reads as placeholder-only content for this repo
- The repo's service, stack, commands, structure, and verification model are explicit
- Korean and English contracts are aligned
- Downstream/template guidance remains present where needed and is clearly separated from this repo's self-contract

## Verification
- Required tests or checks:
  - `bash .claude/scripts/knowledge-repo-audit.sh`
  - manual review of placeholder removal and EN/KO alignment
- Evidence paths or artifacts to refresh:
  - `.claude/PROJECT.md`
  - `.claude/PROJECT.ko.md`
  - related README references if needed

## Contract Seed
- Round goal:
  - make this repository operable through an explicit contract rather than inferred template intent
- Explicit non-goals:
  - no removal of downstream-template guidance
  - no attempt to describe an external product stack that does not exist here
- Hard fail conditions:
  - filled contract erases downstream guidance
  - top sections still contain placeholder-only values
- Evaluator focus:
  - self-host clarity
  - EN/KO parity
  - separation of self-contract vs downstream template behavior
- Expected evidence:
  - filled contract docs with maintainable references

## Handoff Notes
- Package 06 should reuse finalized path/command/contract language from this package.

## Rollback / Risk
- Blast radius:
  - project contract docs
- Safe fallback:
  - revert only the self-contract fill while keeping any clarified downstream notes
