# Harness Gap Hardening Execution Packages (v1)

> This document converts the approved review plan into independently executable task packages.

## Source Baseline
- `docs/implementation/05-harness-gap-hardening-review-plan-v1.md` (role: approved review baseline pending execution)
- `user-review: 2026-03-30 gap review` (role: scope boundary and exclusions)
- `.claude/skills/product-orchestrator/SKILL.md` (role: planning gate owner)
- `.claude/rules/workflow.md` (role: execution boundary owner)
- `.claude/verification.contract.yaml` (role: local verification governance contract)
- `.claude/rules/security.md` (role: current security baseline)
- `.claude/rules/testing.md` (role: current testing baseline)
- `.claude/PROJECT.md` (role: current project contract baseline)

## Objective
- Split the accepted governance hardening work into executable packages that can be implemented without hidden planning.

## Requirement Traceability
| Req ID | Source | Requirement Summary | Task Package | Status |
|--------|--------|---------------------|--------------|--------|
| REQ-HH-1 | GAP-1 | Add value judgment gate before implementation handoff | `01-decision-rubric-and-plan-approval.md` | mapped |
| REQ-HH-2 | GAP-2 | Bound human approval to planning only | `01-decision-rubric-and-plan-approval.md` | mapped |
| REQ-HH-3 | GAP-3 | Introduce repository-local policy-set model | `02-policy-set-model.md` | mapped |
| REQ-HH-4 | GAP-4 | Harden security boundaries and ignore policy | `03-security-boundaries-and-ignore-policy.md` | mapped |
| REQ-HH-5 | GAP-5 | Strengthen test-first and completion evidence behavior | `04-test-first-and-evidence-hardening.md` | mapped |
| REQ-HH-6 | GAP-6 | Replace template-only repo contract with meta-harness contract | `05-meta-harness-project-contract.md` | mapped |
| REQ-HH-7 | GAP-7 | Add downstream bootstrap reference package | `06-downstream-reference-package.md` | mapped |

## Scenario Traceability
| SCN ID | Scenario | Covered By |
|--------|----------|------------|
| SCN-HH-1 | Planner narrows or rejects low-value scope before execution starts | `01-decision-rubric-and-plan-approval.md` |
| SCN-HH-2 | Execution loop runs without reintroducing human checkpoints after start | `01-decision-rubric-and-plan-approval.md` |
| SCN-HH-3 | Local checks are grouped into named policy sets that can later map outward | `02-policy-set-model.md` |
| SCN-HH-4 | Agents avoid sensitive paths and follow explicit ignore rules | `03-security-boundaries-and-ignore-policy.md` |
| SCN-HH-5 | Behavior-changing work cannot close with weak evidence by default | `04-test-first-and-evidence-hardening.md` |
| SCN-HH-6 | Maintainers can operate this repo using a filled project contract | `05-meta-harness-project-contract.md` |
| SCN-HH-7 | Downstream adopters can start from a concrete reference package | `06-downstream-reference-package.md` |

## Task Package Index
| Order | Package | Goal | Parallel Group | Depends On |
|------|---------|------|----------------|------------|
| 01 | [01-decision-rubric-and-plan-approval.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/01-decision-rubric-and-plan-approval.md) | Add value rubric and bound planning-only approval | G1 | - |
| 02 | [02-policy-set-model.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/02-policy-set-model.md) | Introduce local policy-set model | G2 | 01 |
| 03 | [03-security-boundaries-and-ignore-policy.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/03-security-boundaries-and-ignore-policy.md) | Harden tool/path boundaries and ignore behavior | G2 | 02 |
| 04 | [04-test-first-and-evidence-hardening.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/04-test-first-and-evidence-hardening.md) | Tighten test-first and completion evidence rules | G3 | 01, 02 |
| 05 | [05-meta-harness-project-contract.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/05-meta-harness-project-contract.md) | Fill this repo's real operating contract | G4 | 01 |
| 06 | [06-downstream-reference-package.md](/Users/dev/claude-settings/docs/implementation/06-harness-gap-hardening-tasks/06-downstream-reference-package.md) | Add a copyable downstream reference package | G4 | 05 |

## Execution Order Notes
- Package 01 should land first because approval-boundary wording influences the rest of the workflow.
- Packages 02 and 03 are coupled; define policy groups before finalizing security enforcement language.
- Package 04 should consume the policy model from Package 02 so testing rules can align with the same local governance vocabulary.
- Package 05 can start once Package 01 is stable because the project contract should reflect the planning/execution boundary.
- Package 06 should follow Package 05 so the downstream reference package reflects the finalized self-contract and guidance.

## Completion Rule
- Do not treat this work as ready to execute until each package remains independently understandable.
- Do not treat the whole effort as complete until all six package docs are implemented and validated.
