# Phase 05: Harness Gap Hardening Review Plan (v1)

> Review-only follow-up plan. Do not merge this into `00-master-plan-v1.md` or treat it as approved execution scope until the user explicitly accepts the plan.

## Source Mapping
| Gap ID | Source | Gap Summary | This Plan Handling |
|--------|--------|-------------|--------------------|
| GAP-1 | user-review 2026-03-30 | Value judgment gate is weaker than document completeness gates | Add explicit decision rubric and non-goal/value scoring before implementation handoff |
| GAP-2 | user-review 2026-03-30 | Pre-execution approval boundary is unclear | Clarify that human approval is allowed only through plan approval and is excluded from implementation -> verification -> recursive improvement loops |
| GAP-3 | user-review 2026-03-30 | No Policy-as-Code level governance | Add a repository-local policy model that is machine-checkable and can later map to enterprise policy engines |
| GAP-4 | user-review 2026-03-30 | Security constraints are still basic | Define zero-trust-style tool/path boundaries, explicit ignore policy, and sensitive path handling |
| GAP-5 | user-review 2026-03-30 | TDD/test-first enforcement is weak | Strengthen test-first and regression expectations at workflow and verifier boundaries |
| GAP-6 | user-review 2026-03-30 | Harness repository operating contract is weak | Replace template-only `PROJECT.md` usage for this repository with a real meta-harness contract |
| GAP-7 | user-review 2026-03-30 | Downstream bootstrap references are insufficient | Add a reference package or sample layout for downstream adopters |

## Goal
- Close the highest-priority governance gaps in this harness repository without expanding scope into runtime metrics, enterprise operations tooling, or Claude subscription-dependent parity work.

## Expected Outcome
- Product-definition work uses an explicit value/scope rubric before execution begins.
- Human approval is clearly bounded to the planning stage and is not reintroduced after execution starts.
- Policy checks become more declarative and easier to port to external policy engines later.
- Security guidance moves from generic rules to enforceable tool/path boundaries.
- Test-first behavior is strengthened where practical for harness and downstream work.
- This repository gets its own explicit operating contract as a meta-harness project.
- Downstream adopters can start from a concrete reference package instead of templates only.

## Explicit Non-Goals
- Implementing DORA, SPACE, cost, or adoption telemetry in this repository
- Building a separate operations-side harness or dashboarding stack
- Completing real Claude runtime parity while Claude access remains unavailable
- Building a Compound Engineering-style long-term solution archive for this repository itself

## Workstreams
| Workstream | Covers | Priority | Depends On |
|------------|--------|----------|------------|
| WS-1 Decision and Approval Boundary | GAP-1, GAP-2 | P1 | - |
| WS-2 Policy and Security Hardening | GAP-3, GAP-4 | P1 | WS-1 |
| WS-3 Test-First Enforcement | GAP-5 | P2 | WS-1 |
| WS-4 Meta-Harness Contract and Reference Package | GAP-6, GAP-7 | P2 | WS-1, WS-2 |

## Scope
- In scope:
  - `.claude/skills/product-orchestrator/SKILL.md`
  - `.claude/skills/product-gate-reviewer/SKILL.md`
  - `.claude/skills/moonshot-orchestrator/SKILL.md`
  - `.claude/skills/pre-flight-check/SKILL.md`
  - `.claude/PROJECT.md`
  - `.claude/PROJECT.ko.md`
  - `.claude/rules/workflow.md`
  - `.claude/rules/testing.md`
  - `.claude/rules/security.md`
  - `.claude/docs/guidelines/product-definition-workflow.md`
  - `.claude/docs/guidelines/verification-contract.md`
  - `.claude/docs/guidelines/knowledge-repository-ops.md`
  - `.claude/scripts/verify-code-policy.sh`
  - `.claude/verification.contract.yaml`
  - `.gitignore`
  - new reviewable guideline/reference files under `.claude/docs/guidelines/` and `docs/`
- Out of scope:
  - external policy engines or hosted governance services
  - downstream repository implementation work
  - new runtime subscriptions or commercial tool setup

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/00-master-plan-v1.md`
  - `docs/implementation/01-execution-plane-and-routing-v1.md`
  - `docs/implementation/02-readiness-gates-and-bootstrap-v1.md`
  - `docs/implementation/03-verification-contract-and-harness-v1.md`
  - `docs/implementation/04-feedback-loop-and-adoption-policy-v1.md`
- Required current contracts:
  - `.claude/skills/product-orchestrator/SKILL.md`
  - `.claude/rules/workflow.md`
  - `.claude/verification.contract.yaml`
  - `.claude/rules/security.md`
  - `.claude/rules/testing.md`
- User constraints from review:
  - human checkpoint is acceptable only before execution starts
  - no operations telemetry implementation is needed in this repository
  - Claude runtime parity can remain partial for now

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P05-1 | Add value judgment rubric | 1) Define a planning-stage rubric for user value, urgency, scope pressure, non-goals, and implementation cost. 2) Require it before `PLAN.md` handoff. 3) Ensure low-value requests can be reduced or rejected. | Product-definition workflow can fail or narrow a plan for value reasons, not only missing detail. |
| P05-2 | Clarify approval boundary | 1) State that plan approval is the last human checkpoint. 2) State that implementation, verification, and retry loops should continue without human checkpoints unless a true blocker appears. 3) Align workflow and orchestrator wording. | Approval scope is documented consistently and excludes post-execution loops. |
| P05-3 | Define repository-local policy model | 1) Introduce a lightweight policy-set concept in docs. 2) Map current checks to named policy groups. 3) Update scripts/contracts to reference policy groups rather than only raw commands where practical. | The repo has a declarative governance model that can later map to OPA/enterprise policy sets. |
| P05-4 | Harden security boundaries | 1) Expand security rules from generic principles to explicit allowed/blocked categories. 2) Add `.claudeignore` guidance or equivalent sensitive-path deny policy. 3) Clarify log redaction and external-content execution rules. | Security docs define concrete tool/path boundaries and ignore behavior. |
| P05-5 | Strengthen test-first rules | 1) Tighten testing guidance for bugfixes and behavior-changing work. 2) Define when failing or missing tests should block completion. 3) Consider policy checks for TODO-only or evidence-light closes. | Test-first expectations become visible at workflow and completion boundaries. |
| P05-6 | Write a real meta-harness project contract | 1) Fill `PROJECT.md` for this repository as a harness-maintenance project. 2) Document supported commands, directory roles, verification expectations, and boundaries. 3) Keep template guidance only where it still serves downstream installation. | This repo has a usable project contract for its own maintenance work. |
| P05-7 | Add downstream reference package | 1) Create a concrete bootstrap reference for adopters. 2) Show minimum required docs and example values. 3) Link it from core guides. | New adopters can copy a working example instead of inferring from templates alone. |

## Workstream Plans

### WS-1 Decision and Approval Boundary

#### Goal
- Make planning gates judge value and scope explicitly, and make human approval boundaries unambiguous.

#### Target Files
- `.claude/skills/product-orchestrator/SKILL.md`
- `.claude/skills/product-gate-reviewer/SKILL.md`
- `.claude/docs/guidelines/product-definition-workflow.md`
- `.claude/rules/workflow.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`

#### Task Breakdown
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| WS1-1 | Define rubric dimensions | Add scoring dimensions for value, urgency, scope fit, non-goal clarity, and cost/benefit. | The rubric can narrow or reject a plan before execution. |
| WS1-2 | Attach rubric to stage gates | Require the rubric at `PRODUCT_INTENT`, `PRD`, and `PLAN` gates. | Gate outcomes are based on both completeness and value judgment. |
| WS1-3 | Bound human approval | Add a clear rule: human checkpoint allowed during planning approval only; post-start loops are autonomous unless blocked. | Approval boundary appears consistently in workflow and orchestrator docs. |

#### Validation Plan
- Review sample requests and confirm the rubric can choose `hold scope` or `scope reduction`.
- Confirm no document suggests human approval inside verify/retry loops.

### WS-2 Policy and Security Hardening

#### Goal
- Move from ad hoc scripts to a named policy model and tighten security boundaries around tools, paths, and sensitive data.

#### Target Files
- `.claude/verification.contract.yaml`
- `.claude/scripts/verify-code-policy.sh`
- `.claude/rules/security.md`
- `.claude/docs/guidelines/verification-contract.md`
- `.claude/docs/guidelines/knowledge-repository-ops.md`
- `.gitignore`
- new `.claudeignore` or equivalent policy doc

#### Task Breakdown
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| WS2-1 | Introduce policy groups | Group existing checks into policy sets such as `knowledge`, `workflow`, `verification`, and `security`. | Contracts and docs refer to named policy groups. |
| WS2-2 | Document future external mapping | Explain how the local policy groups could map to future enterprise policy engines without implementing them now. | Policy docs separate local enforcement from future external enforcement. |
| WS2-3 | Add sensitive-path policy | Define protected paths and deny-by-default guidance for secrets, generated logs, and external artifacts. | Security rules include concrete examples and explicit denial behavior. |
| WS2-4 | Add ignore guidance | Add `.claudeignore` or documented equivalent so agents do not read sensitive/unnecessary paths by default. | The repo has a first-class ignore strategy for agent context control. |

#### Validation Plan
- `verify-code-policy.sh` still works after policy naming changes.
- Knowledge audit still passes after adding policy/security docs.
- Security docs contain explicit path categories, not generic prose only.

### WS-3 Test-First Enforcement

#### Goal
- Strengthen test-first and regression expectations without pretending every harness change requires a full application test stack.

#### Target Files
- `.claude/rules/testing.md`
- `.claude/rules/workflow.md`
- `.claude/skills/implementation-runner/SKILL.md`
- `.claude/skills/completion-verifier/SKILL.md`
- `.claude/scripts/verify-code-policy.sh`
- `.claude/verification.contract.yaml`

#### Task Breakdown
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| WS3-1 | Define test-first thresholds | Distinguish shell/doc/rule edits from behavior-changing workflow edits and define expected verification per class. | The repository no longer treats all changes with the same testing guidance. |
| WS3-2 | Strengthen regression expectation | Require regression tests or equivalent verifier evidence for bugfixes and logic changes when the environment supports it. | Bugfix guidance is stronger and completion logic reflects it. |
| WS3-3 | Add completion penalties | Prevent “done” claims when evidence is missing for behavior-changing work unless the contract explicitly allows fallback. | Completion rules better enforce test/evidence expectations. |

#### Validation Plan
- Review example changes across scripts, docs, and workflow logic.
- Confirm low-risk doc-only changes are not over-blocked.
- Confirm behavior-changing changes need stronger evidence than self-audit alone.

### WS-4 Meta-Harness Contract and Reference Package

#### Goal
- Give this repository a real operating contract and provide adopters with a concrete downstream bootstrap reference.

#### Target Files
- `.claude/PROJECT.md`
- `.claude/PROJECT.ko.md`
- `.claude/README.md`
- new reference docs under `docs/`
- links from `.claude/docs/guidelines/knowledge-repository-ops.md`

#### Task Breakdown
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| WS4-1 | Replace template-only project contract | Fill this repo's service/stack/commands/structure/verification sections as a meta-harness project. | `PROJECT.md` is actionable for maintaining this repository. |
| WS4-2 | Preserve downstream template intent | Keep downstream-install guidance explicit so filling this repo's contract does not remove template behavior for adopters. | The repo has both a self-contract and downstream guidance with clear separation. |
| WS4-3 | Add reference package | Create a sample downstream bootstrap package with minimum docs and example values. | Adopters can follow a concrete example, not only abstract templates. |

#### Validation Plan
- `PROJECT.md` no longer contains placeholder-only top sections for this repository.
- Reference package is linked from a discoverable guide.
- Audit policy remains consistent with the new contract state.

## Deliverables
- Reviewable plan document for all accepted gaps
- File-level target list grouped by workstream
- Validation criteria for each workstream
- Deferred item list that keeps operations telemetry and Claude parity out of current scope

## File-Level Change Draft
- `.claude/skills/product-orchestrator/SKILL.md`
  - Add value judgment rubric requirements and plan-stage approval boundary.
- `.claude/skills/product-gate-reviewer/SKILL.md`
  - Add rubric-based gate review criteria.
- `.claude/docs/guidelines/product-definition-workflow.md`
  - Add value rubric, explicit non-goal pressure handling, and approval-boundary wording.
- `.claude/rules/workflow.md`
  - State that human approval ends at planning approval and is not part of execution loops.
- `.claude/skills/moonshot-orchestrator/SKILL.md`
  - Align retry/verification loop language with the no-post-start-checkpoint rule.
- `.claude/verification.contract.yaml`
  - Introduce named policy grouping and stronger evidence semantics where appropriate.
- `.claude/scripts/verify-code-policy.sh`
  - Expand policy terminology and possibly add checks that support stronger guardrails.
- `.claude/rules/security.md`
  - Add explicit sensitive-path, tool-boundary, and ignore-policy language.
- `.claude/rules/testing.md`
  - Strengthen test-first and regression rules by change class.
- `.claude/PROJECT.md`
  - Replace template-only sections with real harness repository contract content.
- `.claude/PROJECT.ko.md`
  - Keep the Korean contract aligned with the English version.
- `.claude/docs/guidelines/verification-contract.md`
  - Clarify local policy groups and future enterprise mapping.
- `.claude/docs/guidelines/knowledge-repository-ops.md`
  - Link the reference package and any ignore-policy guidance.
- `docs/...`
  - Add downstream bootstrap reference package or sample directory.

## Validation Plan
- `bash .claude/scripts/knowledge-repo-audit.sh`
- `bash .claude/scripts/verify-code-policy.sh`
- `bash .claude/scripts/workflow-enforcement.sh verify`
- `bash -n .claude/scripts/verify-code-policy.sh`
- review diff for consistency between English and Korean contract docs
- manual policy review to ensure observability/runtime parity work remains explicitly deferred

## Approval Notes
- This plan assumes approval is required only to start execution of the approved plan.
- After execution begins, implementation -> verification -> retry loops should remain autonomous unless a true blocker or external dependency is encountered.

## Deferred Items
- Operations telemetry model and data pipeline
- Enterprise policy-engine integration
- Claude subscription-dependent runtime parity work
- Repository-internal solution compounding archive

## Implementation Exit Criteria
- Every P1 and P2 gap above is mapped to concrete files and validation steps.
- Approval boundary language is explicit and consistent.
- Policy/security/testing improvements remain repository-local and portable.
- Deferred items remain out of current implementation scope.
