# Phase 03: Verification Contract and Harness (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-11 | `completion-verifier` harness policy | Verification needs stable indeterminate handling and evidence rules | Introduce project-level verification contract |
| REQ-1 | user-request discussion | Improve system-level workflow, not only isolated docs | Separate verdict schema from project-specific commands |
| REQ-2 | user-request discussion | Real projects should be able to adopt the workflow cleanly | Make verification requirements declarative for downstream projects |

## Goal
- Make verification portable across downstream projects by separating harness verdict semantics from project-specific command selection.

## Expected Outcome
- Downstream projects can define verification behavior declaratively.
- Completion and evidence gates operate on a stable contract instead of implicit tool assumptions.
- The repository remains responsible for verdict rules, not every possible project command set.

## Scope
- In scope:
  - `.claude/skills/completion-verifier/SKILL.md`
  - `.claude/skills/verification-evidence-gate/SKILL.md`
  - `.claude/skills/moonshot-orchestrator/SKILL.md`
  - `.claude/agents/verification/verify-changes.sh`
  - `.claude/agents/verification/verify-runtime.sh`
  - New verification contract guideline/spec
- Out of scope:
  - Implementing per-project contract files in external repositories
  - Rewriting every shell verifier for every framework

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/00-master-plan-v1.md`
  - `docs/implementation/02-readiness-gates-and-bootstrap-v1.md`
- Required code/data:
  - Current completion-verifier and evidence gate contracts
  - Current shell verifier artifact format

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Define verification contract spec | 1) Create a new guideline describing a downstream `.claude/verification.contract.yaml` shape. 2) Include fields for required commands, required artifacts, strict triggers, and indeterminate policy. 3) Map verdict JSON fields to the contract. | Contract spec exists and is understandable without reading shell scripts. |
| P03-2 | Align completion-verifier with the contract | 1) Update skill docs to prefer explicit contract data when present. 2) Keep filesystem auto-detection as fallback. 3) Clarify when `indeterminate` is allowed. | Completion-verifier docs reflect contract-first behavior. |
| P03-3 | Align evidence gate and shell verifiers | 1) Document artifact expectations. 2) Ensure shell scripts remain generic verdict emitters. 3) Remove assumptions that every project has the same commands or domain checks. | Evidence and verifier docs describe reusable semantics instead of project-specific behavior. |
| P03-4 | Add verification-contract gate | 1) Create a gate that checks whether a downstream project has enough verification definition. 2) If absent, allow standard-mode fallback but raise a warning; block in strict mode. | Verification readiness behavior is explicit and matches workflow profile. |

## Validation Plan
- [ ] Build/type checks: `bash .claude/scripts/knowledge-repo-audit.sh`
- [ ] Behavior checks: confirm strict and standard examples differ only by gate policy, not by undocumented assumptions.
- [ ] Regression checks: shell verifier docs and evidence gate use the same verdict vocabulary.

## Evidence to Mark Done
- New verification contract guideline
- Updated completion-verifier and evidence gate docs
- Updated verifier script comments or interfaces
- Example contract snippet in docs

## Deliverables
- Updated `.claude/skills/completion-verifier/SKILL.md`
- Updated `.claude/skills/verification-evidence-gate/SKILL.md`
- Updated `.claude/skills/moonshot-orchestrator/SKILL.md`
- Updated `.claude/agents/verification/verify-changes.sh`
- Updated `.claude/agents/verification/verify-runtime.sh`
- New `.claude/skills/verification-contract-gate/SKILL.md`
- New `.claude/docs/guidelines/verification-contract.md`

## File-Level Change Draft
- `.claude/skills/completion-verifier/SKILL.md`
  - Prefer explicit verification contract over heuristic-only detection.
  - Document `contract missing + standard profile` versus `contract missing + strict profile`.
- `.claude/skills/verification-evidence-gate/SKILL.md`
  - Reference contract-defined evidence artifacts.
- `.claude/skills/moonshot-orchestrator/SKILL.md`
  - Add `verification-contract-gate` to allowed steps and dynamic injection logic.
- `.claude/agents/verification/verify-changes.sh`
  - Reword comments and outputs so the script is framed as a generic verdict emitter.
  - Keep project-specific checks behind opt-in contract hooks rather than baked-in assumptions.
- `.claude/agents/verification/verify-runtime.sh`
  - Mirror the same contract vocabulary and artifact naming guidance.
- `.claude/skills/verification-contract-gate/SKILL.md`
  - New gate for downstream verification readiness.
- `.claude/docs/guidelines/verification-contract.md`
  - New declarative contract spec with examples.

## Phase Completion Checklist
- [x] Contract-first verification model is defined.
- [x] Strict versus standard behavior is called out explicitly.
- [x] File-level updates are identified for both docs and shell verifiers.

## Implementation Exit Criteria
- [ ] Completion-verifier, evidence gate, and verifier scripts all share one verdict vocabulary.
- [ ] Downstream projects can define verification expectations without editing core harness logic.
- [ ] Strict mode blocks missing verification contracts where intended.

## Handoff Notes
- Phase 04 should use the new contract and gate terminology when updating failure analysis.
