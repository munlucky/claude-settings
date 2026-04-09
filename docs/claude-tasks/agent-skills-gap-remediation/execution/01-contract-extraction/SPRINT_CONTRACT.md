# SPRINT CONTRACT

## Slice
- Name: Contract Extraction
- Owner: Codex
- Source task: `.claude/docs/tasks/agent-skills-gap-remediation/work-plan.md`
- Phase document: `.claude/docs/tasks/agent-skills-gap-remediation/implementation/01-contract-extraction-v1.md`

## Round Goal
- Extract canonical workflow contracts into dedicated files and update the phase-01 skill consumers to reference them.

## In-Scope Traceability
- Requirement IDs (`REQ-*`): SRC-1, SRC-2
- Critical scenarios (`SCN-*`): meta-harness contract drift reduction
- UAT-critical checks covered this round: skill references resolve to canonical contract files

## Non-Goals
- Do not change runtime state handling.
- Do not add proposer logic.

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Planned Changes
- Add `.claude/schemas/analysis-context.schema.yaml`
- Add `.claude/config/workflow-bundles.yaml`
- Update moonshot orchestrator and routing skill docs

## Policy Anchors
- Always-loaded rules: `.claude/rules/basic-principles.md`, `.claude/rules/workflow.md`, `.claude/rules/context-management.md`, `.claude/rules/communication.md`, `.claude/rules/output-format.md`
- Active workspace contract: `.claude/CLAUDE.md`
- Verification contract: `.claude/verification.contract.yaml`
- Phase-specific guides: `.claude/docs/tasks/agent-skills-gap-remediation/work-plan.md`
- Round policy summary: behavior-preserving extraction only; no new public entrypoints

## Review Cadence
- First review checkpoint: after canonical files and skill references are updated
- Re-review trigger: if skill semantics drift from current public contract
- Review owners: `codex-review-code`

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
| Canonical schema added | contract | `.claude/schemas/analysis-context.schema.yaml` exists |
| Canonical bundle registry added | contract | `.claude/config/workflow-bundles.yaml` exists |
| Skill consumers updated | docs | target skill docs reference the canonical files |

## Traceability Exit Criteria
| ID | Type | Verification Path | Evidence Required |
|----|------|-------------------|-------------------|
| SRC-1 | REQ | docs review | schema file + skill references |
| SRC-2 | REQ | docs review | bundle registry + routing references |

## Evaluator Focus
- accidental semantic changes to phase routing
- broken references in skill docs
- divergence between English and Korean variants

## Evidence
- Required commands: `git diff --stat`, `bash .claude/scripts/knowledge-repo-audit.sh`
- Runtime flow: none
- Screenshots/logs: knowledge audit result if relevant
- Requirements traceability update: not required in this round
- Scenario matrix update: not required in this round
- UAT checklist state: not required in this round

## Finish Rule
- Clean finish requires: canonical files added, skill references updated, review completed, and verification notes recorded
- Continue-now rule: if in-scope work remains and no real stop condition exists, do not stop on checkpoint evidence alone
- Resume-later handoff trigger: unresolved contract drift or doc parity issue
- Retry-loop trigger: missing or incorrect canonical references
- Target completion score: 100

## Risks
- over-pruning skill docs may remove useful runtime guidance
- Korean/English variants may drift if updated unevenly
