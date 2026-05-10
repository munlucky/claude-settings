# Phase 02: Plan Writer Ambiguity Gate And AC Extraction (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| OHA-003 | User strategy Phase 2 | Add clarity and ambiguity scoring before implementation | Add plan-writer gate fields and thresholds |
| OHA-004 | User strategy Phase 2 | Record unresolved questions and assumptions-ledger link | Add blocker/assumption routing in plan prep |
| OHA-014 | Additional improvements | Add brownfield readiness gate and product-value check | Integrate as scoring dimensions or review gates |

## Goal

- Make `moonshot-plan-writer` normalize PRD/SPEC sources into a Goal Contract, then score execution readiness before phase docs become runnable.

## Expected Outcome

- PRD/SPEC documents are treated as requirement sources, not automatically as execution-ready contracts.
- Ambiguity scoring determines whether plan-writer proceeds, records assumptions, or blocks for contract clarification.
- Acceptance criteria are extracted into stable `AC-*` ids that later phases can link to WORKSETS and QA evidence.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn:
    - "01"
  conflictsWith:
    - "03"
    - "04"
  ownedPaths:
    - ".codex/skills/moonshot-plan-writer/SKILL.md"
    - ".claude/skills/moonshot-plan-writer/SKILL.md"
    - ".claude/scripts/agent-loop-phase-plan-lib.mjs"
    - ".claude/docs/guidelines/product-definition-workflow.md"
    - "docs/implementation/ouroboros-harness-adoption-2026-05-10/02-plan-writer-ambiguity-ac-extraction-v1.md"
  readOnlyPaths:
    - ".claude/skills/assumption-ledger/SKILL.md"
    - ".claude/skills/product-gate-reviewer/SKILL.md"
    - ".claude/skills/moonshot-phase-runner/SKILL.md"
    - "docs/analysis/ouroboros-harness-adoption-inventory.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_policy_update"
```

## Scope

- In scope:
  - Add `goalClarity`, `scopeClarity`, `acceptanceCriteriaClarity`, `verificationClarity`, `clarityScore`, `ambiguityScore`.
  - Add thresholds: `<=0.20` executable, `0.20..0.35` constrained execution with assumptions, `>0.35` blocked.
  - Add PRD/SPEC gap detection for unverifiable adjectives, missing non-goals, missing verification commands, and ambiguous acceptance criteria.
  - Add AC extraction rules from source requirements and traceability mapping.
  - Add product-value and brownfield readiness checks as non-public stage-owner responsibilities.
- Out of scope:
  - Interactive Socratic interview clone.
  - User-facing command additions.
  - LLM-only scoring without evidence.

## Preconditions and Inputs

- Phase 01 Goal Contract schema/template is available.
- Existing assumption policy remains: non-critical ambiguity can move to assumptions, core scope ambiguity blocks.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P02-1 | Add scoring contract | Define score dimensions and threshold behavior in plan-writer docs and generation logic | Plan prep output records ambiguity score and decision |
| P02-2 | Add PRD/SPEC gap detector | Detect missing scope, non-goals, AC, verification plan, and brownfield context | Ambiguous fixture blocks or records assumptions |
| P02-3 | Add AC extraction | Generate `AC-*` ids from requirement sources and map to phase docs | Master traceability includes AC ids |
| P02-4 | Add assumption routing | Link unresolved non-critical ambiguity to assumption-ledger artifacts | Constrained execution records assumption path |
| P02-5 | Add review trigger | Trigger product/engineering review when score is high or value is unclear | Review evidence is required before runnable package |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P02-1 | A vague PRD does not silently become runnable phase work | `node --check .claude/scripts/agent-loop-phase-plan-lib.mjs` plus ambiguity fixture | Fixture records blocked or constrained state | `QA_REPORT.md` for this phase |
| SCN-P02-2 | A clear PRD/SPEC maps requirements to AC ids | targeted plan-writer fixture or self-test | Master traceability includes `AC-*` mappings | `QA_REPORT.md` for this phase |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P02-1 | optional fixture under `.claude/docs/runtime-parity-reference-plan/` | `.codex/skills/moonshot-plan-writer/SKILL.md`, `.claude/skills/moonshot-plan-writer/SKILL.md` | skill text and generated plan fixture | `bash .claude/scripts/knowledge-repo-audit.sh` | Errors 0 |
| P02-2 | none | `.claude/scripts/agent-loop-phase-plan-lib.mjs` | plan generation parser | `node --check .claude/scripts/agent-loop-phase-plan-lib.mjs` | Exit 0 |
| P02-3 | none | `.claude/docs/guidelines/product-definition-workflow.md` | docs audit | `bash .claude/scripts/knowledge-repo-audit.sh` | Errors 0 |

## Blockers And Review

- Blocker condition: Ambiguity scoring is not reproducible from source documents or explicit assumptions.
- First review checkpoint: Review threshold semantics before modifying runner dispatch behavior.
- Re-review trigger: Any rule that would block trivial one-step tasks without a PRD/SPEC source.
- Verification evidence path: `docs/implementation/ouroboros-harness-adoption-2026-05-10/execution/02-phase-02-plan-writer-ambiguity-ac-extraction-v1/QA_REPORT.md`

## Validation Plan

- [ ] `node --check .claude/scripts/agent-loop-phase-plan-lib.mjs`
- [ ] `bash .claude/scripts/knowledge-repo-audit.sh`
- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`

## Evidence to Mark Done

- Scoring threshold documentation.
- Fixture or self-test for clear and ambiguous source docs.
- AC extraction output linked to master traceability.

## Deliverables

- Plan-writer ambiguity gate contract.
- AC extraction rules.
- Assumption/blocker routing guidance.

## Phase Completion Checklist

- [ ] Ambiguity dimensions and thresholds are documented and machine-readable.
- [ ] AC extraction creates stable ids.
- [ ] Plan-writer blocks or constrains high-ambiguity sources.
- [ ] Existing simple-task path is not overburdened.

## Handoff Notes

- Phase 03 uses the extracted AC ids to extend WORKSETS and artifact projection.
