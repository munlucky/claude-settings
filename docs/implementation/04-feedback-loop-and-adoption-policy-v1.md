# Phase 04: Feedback Loop and Adoption Policy (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-3 | user-request discussion | Always forcing orchestrator has downsides | Encode explicit adoption and bypass policy |
| SRC-12 | `failure-analyzer` improvement targets | Failure analysis should recognize new workflow failure classes | Add routing and readiness failure categories |
| SRC-13 | `workflow-self-improver` execution model | Meta improvements should target rules, docs, and skill definitions safely | Extend improvement targets for gates and contracts |

## Goal
- Close the loop so the new workflow architecture can self-diagnose routing mistakes, missing contracts, and bad adoption policy.

## Expected Outcome
- Failure analysis can point to routing mismatch or missing gate/contract design as the cause of failure.
- Workflow self-improvement can generate safe proposals for gate docs and contract docs, not only old rule files.
- The repository documents when users should invoke the orchestrator directly, when it should auto-run, and when bypass is preferred.

## Scope
- In scope:
  - `.claude/skills/failure-analyzer/SKILL.md`
  - `.claude/skills/workflow-self-improver/SKILL.md`
  - `.claude/rules/workflow.md`
  - `.claude/docs/guidelines/analysis-guide.md`
  - `README.md`
- Out of scope:
  - New runtime tools
  - Changes to downstream repositories

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/00-master-plan-v1.md`
  - `docs/implementation/01-execution-plane-and-routing-v1.md`
  - `docs/implementation/02-readiness-gates-and-bootstrap-v1.md`
  - `docs/implementation/03-verification-contract-and-harness-v1.md`
- Required code/data:
  - Current failure analysis and self-improvement docs

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Expand failure taxonomy | 1) Add categories for `execution_plane_mismatch`, `readiness_gate_missing`, and `verification_contract_missing`. 2) Map each to target rules or skills. 3) Add examples. | Failure-analyzer can explain architecture-level failures, not only code issues. |
| P04-2 | Expand self-improvement targets | 1) Allow proposals that target gate docs and verification contract docs. 2) Keep skill-logic changes manual-review only. 3) Document safe auto-apply boundaries. | Workflow-self-improver understands the new artifacts. |
| P04-3 | Write adoption policy | 1) Update workflow rule and README to define `orchestrator by default, bypass by intent`. 2) Give concrete examples. 3) Cover read-only and self-host changes. | Users can understand when direct invocation is correct. |
| P04-4 | Update analysis guidance | 1) Add a guideline describing how to diagnose failures in the new layered workflow. 2) Include where to look first: routing, readiness, contract, verification, review. | Maintainers have a repeatable debugging order. |

## Validation Plan
- [ ] Build/type checks: `bash .claude/scripts/knowledge-repo-audit.sh`
- [ ] Behavior checks: ensure examples include both successful bypass and harmful bypass cases.
- [ ] Regression checks: self-improver still keeps `SKILL.md` logic changes behind manual approval.

## Evidence to Mark Done
- Updated failure taxonomy and target mapping
- Updated self-improvement target table
- README or workflow docs containing adoption examples
- Analysis guide section for layered debugging

## Deliverables
- Updated `.claude/skills/failure-analyzer/SKILL.md`
- Updated `.claude/skills/workflow-self-improver/SKILL.md`
- Updated `.claude/rules/workflow.md`
- Updated `.claude/docs/guidelines/analysis-guide.md`
- Updated `README.md`

## File-Level Change Draft
- `.claude/skills/failure-analyzer/SKILL.md`
  - Add new failure categories tied to routing and readiness architecture.
- `.claude/skills/workflow-self-improver/SKILL.md`
  - Extend target file table to include gate skills and contract guidelines.
  - Keep logic changes to `SKILL.md` files as manual approval items.
- `.claude/rules/workflow.md`
  - Finalize adoption policy wording and examples.
- `.claude/docs/guidelines/analysis-guide.md`
  - Add layered diagnosis order: plane -> readiness -> contract -> verification -> review.
- `README.md`
  - Add short operator guidance for direct use versus orchestrated use.

## Phase Completion Checklist
- [x] Failure taxonomy additions are explicit.
- [x] Adoption policy is encoded as documentation work, not only tribal knowledge.
- [x] Self-improvement boundaries remain safe.

## Implementation Exit Criteria
- [ ] Failure analysis can correctly diagnose the new workflow failure classes.
- [ ] Self-improvement proposals cover gates and contracts without auto-editing skill logic unsafely.
- [ ] Users have a documented rule for when to bypass the orchestrator intentionally.

## Handoff Notes
- This phase is the final policy layer after the architecture, gates, and verification contract are in place.
