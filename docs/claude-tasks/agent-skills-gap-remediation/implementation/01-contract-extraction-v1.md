# Phase 01: Contract Extraction (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-1 | work-plan Part A.1 | Extract `analysisContext` into a real contract | Create canonical schema file and point skills to it |
| SRC-2 | work-plan Part A.2 | Turn bundle selection into data | Create workflow bundle registry and update routing docs |

## Goal
- Centralize duplicated workflow contracts into canonical files without changing public entrypoints or execution semantics.

## Expected Outcome
- `.claude/schemas/analysis-context.schema.yaml` exists
- `.claude/config/workflow-bundles.yaml` exists
- orchestrator/routing skills reference those files instead of embedding the full contracts inline

## Scope
- In scope:
  - contract extraction
  - skill documentation alignment
  - task-local phase artifacts
- Out of scope:
  - script consumers of the new bundle registry
  - workflow evidence model changes
  - proposer loop implementation

## Preconditions and Inputs
- Required docs:
  - `.claude/docs/tasks/agent-skills-gap-remediation/implementation/00-master-plan-v1.md`
  - `.claude/docs/tasks/agent-skills-gap-remediation/work-plan.md`
- Required code/data:
  - `.claude/skills/moonshot-orchestrator/SKILL.md`
  - `.claude/skills/moonshot-orchestrator/SKILL.ko.md`
  - `.claude/skills/moonshot-decide-sequence/SKILL.md`
  - `.claude/skills/moonshot-decide-sequence/SKILL.ko.md`

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Extract analysis schema | 1) Define canonical analysis context structure 2) Store it under `.claude/schemas/` 3) Replace duplicated skill blocks with references | Schema file exists and both skills reference it |
| P01-2 | Extract bundle routing registry | 1) Encode bundle rules in `.claude/config/workflow-bundles.yaml` 2) Reference the registry from routing docs | Registry exists and routing docs point to it |
| P01-3 | Preserve public contract clarity | 1) Keep public entrypoint guidance in skills 2) Avoid semantic changes to phase logic | Entry policy remains readable and no new public entrypoints are added |

## Validation Plan
- [ ] Build/type checks: `node --check` is not applicable to YAML/markdown-only extraction
- [ ] Behavior checks: confirm references in orchestrator and decide-sequence match the new canonical paths
- [ ] Regression checks: verify no existing execution script paths were renamed or removed

## Evidence to Mark Done
- changed skill references
- new schema/config files
- updated phase artifacts for this slice

## Deliverables
- `.claude/schemas/analysis-context.schema.yaml`
- `.claude/config/workflow-bundles.yaml`
- updated orchestrator and routing skill docs

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- Phase 02 should consume the new canonical contracts when normalizing completion and evidence state.
