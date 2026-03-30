# TASK

## Summary
- Slice name: Downstream reference package
- Goal: Add a concrete, copyable reference package so adopters can see minimum bootstrap docs and example values in one place
- Requirement IDs (`REQ-*`): `REQ-HH-7`
- Scenario IDs (`SCN-*`): `SCN-HH-7`

## Input
- `docs/implementation/05-harness-gap-hardening-review-plan-v1.md`
- finalized self-contract from Package 05
- `.claude/docs/guidelines/knowledge-repository-ops.md`
- `.claude/README.md`
- current downstream template references in `.claude/PROJECT.md`

## Output
- A downstream bootstrap reference package or sample directory
- Core guides link to the reference package as the preferred example path

## Scope
- Impacted user flow: downstream adoption and bootstrap
- Impacted systems or modules:
  - reference docs under `docs/`
  - knowledge-repository ops guide
  - repo README/discovery links

## Dependencies
- Upstream prerequisites:
  - [05-meta-harness-project-contract.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/05-meta-harness-project-contract.md)
- Blocking conditions:
  - uncertainty about whether the reference package should be minimal skeleton only or fully populated examples

## Parallelization
- Parallelizable: Yes
- Parallel group: `G4`

## Done Criteria
- Adopters can find a single concrete reference package from a core guide
- The reference includes minimum required docs and example content boundaries
- The package does not pretend to be a universal template for every project type
- The reference package and self-contract do not contradict each other

## Verification
- Required tests or checks:
  - `bash .claude/scripts/knowledge-repo-audit.sh`
  - manual link and discoverability review
- Evidence paths or artifacts to refresh:
  - new reference package docs
  - updated guide links

## Contract Seed
- Round goal:
  - improve downstream adoption by giving users a concrete starting point
- Explicit non-goals:
  - no full sample application
  - no framework-specific starter explosion
- Hard fail conditions:
  - reference package is too abstract to be useful
  - core guides do not link to it
- Evaluator focus:
  - discoverability
  - realism of example values
  - consistency with self-contract and downstream guidance
- Expected evidence:
  - new reference package files and updated guide links

## Handoff Notes
- If more than one reference package is eventually needed, this package should record why one package stopped being sufficient.

## Rollback / Risk
- Blast radius:
  - documentation and adoption guidance only
- Safe fallback:
  - keep link updates but remove the reference package if it proves misleading
