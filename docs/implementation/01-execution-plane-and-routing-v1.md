# Phase 01: Execution Plane and Routing (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1 | user-request discussion | Improve the whole workflow architecture for this repository | Introduce routing model and bundle-based chain selection |
| REQ-3 | user-request discussion | Do not blindly force `moonshot-orchestrator` | Define default-entry policy with explicit bypass rules |
| REQ-4 | user-request discussion | Produce concrete file-level guidance | List exact files and patch intent |
| SRC-5 | `README.md` overview | Repository is a reusable workflow distribution layer | Add `meta_harness` routing so the repository can manage itself safely |
| SRC-6 | `moonshot-orchestrator` workflow | Orchestrator currently owns too many responsibilities | Split routing concerns and formalize injection points |
| SRC-7 | `moonshot-decide-sequence` chain rules | Current chain list is long and monolithic | Replace with bundle-driven sequence selection |

## Goal
- Add a first-class routing model that distinguishes downstream product work from work on the harness itself.

## Expected Outcome
- The orchestrator can identify `read_only`, `product_project`, and `meta_harness` requests before building a chain.
- Direct-skill invocation remains legal when the user is intentionally bypassing the default entry point.
- The sequence logic becomes shorter and easier to maintain through bundle composition.

## Scope
- In scope:
  - `.claude/skills/moonshot-orchestrator/SKILL.md`
  - `.claude/skills/moonshot-decide-sequence/SKILL.md`
  - `.claude/rules/workflow.md`
  - `.claude/docs/guidelines/skill-composition.md`
  - `README.md`
- Out of scope:
  - New verification scripts
  - Gate skill implementation details
  - Project-level contract schemas

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/00-master-plan-v1.md`
  - `README.md`
- Required code/data:
  - Current orchestrator skill definition
  - Current sequence decision logic

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Add execution-plane schema | 1) Extend orchestrator `analysisContext.signals` with `executionPlane`. 2) Define values `read_only`, `product_project`, `meta_harness`. 3) Add heuristics for `.claude/skills`, `.claude/rules`, `.claude/agents`, install/distribution changes. | `moonshot-orchestrator/SKILL.md` documents the new signal and routing heuristics. |
| P01-2 | Define default-entry policy | 1) Update workflow rule to say orchestrator is default for code work. 2) Add explicit bypass exceptions for named skill invocation, read-only tasks, and orchestrator self-work. 3) Keep language unambiguous. | `.claude/rules/workflow.md` reflects `default, not mandatory` policy. |
| P01-3 | Convert sequence selection to bundles | 1) Replace long flat chains with bundle names such as `planning-bundle`, `implementation-bundle`, `verification-bundle`, `review-bundle`, `meta-harness-bundle`. 2) Keep bundle expansion documented. 3) Preserve strict overlay behavior. | `moonshot-decide-sequence/SKILL.md` is shorter, and bundle-to-step mapping is explicit. |
| P01-4 | Document routing policy for adopters | 1) Add a short guideline page for routing semantics. 2) Update README workflow section to explain when orchestrator auto-runs versus when direct skills are acceptable. | Maintainers can explain the policy without reverse-engineering the orchestrator skill. |

## Validation Plan
- [ ] Build/type checks: `bash .claude/scripts/knowledge-repo-audit.sh`
- [ ] Behavior checks: confirm routing examples cover `meta_harness`, direct skill invocation, and read-only requests.
- [ ] Regression checks: verify strict profile overlays still reference valid step names after bundle refactor.

## Evidence to Mark Done
- Updated diff for orchestrator, sequence, and workflow docs
- Audit script output
- Example request-to-plane mapping captured in notes or docs

## Deliverables
- Updated `.claude/skills/moonshot-orchestrator/SKILL.md`
- Updated `.claude/skills/moonshot-decide-sequence/SKILL.md`
- Updated `.claude/rules/workflow.md`
- Updated `.claude/docs/guidelines/skill-composition.md`
- Updated `README.md`

## File-Level Change Draft
- `.claude/skills/moonshot-orchestrator/SKILL.md`
  - Add `executionPlane` to `analysisContext`.
  - Insert a routing step before task classification.
  - Add dynamic injection rules keyed on `executionPlane`.
- `.claude/skills/moonshot-decide-sequence/SKILL.md`
  - Replace literal complexity chains with bundle selections.
  - Add a `meta-harness-bundle` path that excludes downstream bootstrap tasks.
- `.claude/rules/workflow.md`
  - Change wording from effectively mandatory orchestrator use to `default unless read-only, explicitly direct-skill, or self-host orchestration work`.
- `.claude/docs/guidelines/skill-composition.md`
  - Promote from reference-only to active design guidance with bundle examples.
- `README.md`
  - Update workflow summary and direct-use examples.

## Phase Completion Checklist
- [x] Source requirements are mapped to concrete edits.
- [x] Target files and patch intent are explicit.
- [x] Validation and regression checks are defined.

## Implementation Exit Criteria
- [ ] Routing chooses the correct plane on representative examples.
- [ ] Default-entry policy is reflected consistently in docs and orchestrator logic.
- [ ] Bundle-based sequence logic replaces legacy flat chain sprawl without losing strict-mode behavior.

## Handoff Notes
- Phase 02 depends on the `executionPlane` signal and bundle names introduced here.
