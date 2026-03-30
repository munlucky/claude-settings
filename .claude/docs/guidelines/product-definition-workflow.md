# Product Definition Workflow

> Use this workflow before implementation when the request is still at the product-definition stage.

## Goal

Convert a raw product idea into implementation-ready artifacts without widening the process into market validation, interviews, or MVP experiment automation.

The workflow stops at "ready to build":

1. Product intent is bounded.
2. Product requirements are concrete.
3. Product behavior is modeled.
4. Architecture is defined.
5. Work is sliced into independently executable units.
6. Downstream implementation has enough structure to negotiate a testable sprint contract instead of guessing from the plan.

## Stage Contract

All stages follow the same loop:

1. Draft
2. Critique
3. Revise
4. Gate decision: `pass`, `conditional_pass`, or `fail`

Guardrails:
- Max rewrite budget per stage: 2 retries after the first draft
- Do not ask the user unless the blocker prevents safe progression
- Repeated feedback twice on the same point becomes `conditional_pass`
- Revisions must remove omissions, not add speculative scope
- Prefer scope reduction to speculative expansion when value is unclear

## Value Judgment Rubric

Use this rubric at `PRODUCT_INTENT`, `PRD`, and `PLAN`.

Required dimensions:
- user value
- urgency
- scope fit
- non-goal clarity
- cost/benefit

Recommended outcomes:
- `pass`: complete and value is defensible
- `conditional_pass`: proceed only after assumptions or scope reduction
- `fail`: value is weak, scope is unstable, or cost/benefit is not defensible

## Stages

### 1. PRODUCT_INTENT

Output:
- `{tasksRoot}/{feature-name}/product/PRODUCT_INTENT.md`

Required sections:
- Problem
- Target user
- Core value
- Non-goals / excluded scope
- Constraints
- One-line success state

Gate:
- The team can state what will not be built, not only what will be built.
- The artifact should explain why this work matters now.

### 2. PRD

Output:
- `{tasksRoot}/{feature-name}/product/PRD.md`

Required sections:
- User scenarios
- Core features
- Product-level non-functional requirements
- Out of scope
- Acceptance criteria

Gate:
- A PM can read it end-to-end, and implementation questions are limited.
- The feature list is prioritized by value instead of preserving every request.

### 3. SOLUTION

Output:
- `{tasksRoot}/{feature-name}/product/SOLUTION.md`

Required sections:
- Primary user flows
- Screens or state transitions
- Entity overview
- Exception flows
- Operational scenarios

Rules:
- No tech stack choices
- No class/module breakdown
- No code structure discussion

Gate:
- The product can be explained as a behavior model without referencing code.

### 4. SPEC

Output:
- `{tasksRoot}/{feature-name}/product/SPEC.md`
- `{tasksRoot}/{feature-name}/product/ADR/*.md`

Required sections:
- System context
- Major containers
- Data flow
- External dependencies
- Security, reliability, performance constraints
- Architecture decisions

Gate:
- Architecture choices are explicit and leave little room for arbitrary interpretation during implementation.

### 5. EXECUTION_PLAN

Output:
- `{tasksRoot}/{feature-name}/product/PLAN.md`
- `{tasksRoot}/{feature-name}/product/tasks/*.md`

Required sections:
- Vertical slice decomposition
- Parallel execution groups
- Dependencies
- Done criteria
- Verification strategy
- Rollback or blast radius notes
- Contract seed for downstream implementation

Gate:
- Each task can be handed directly to the implementation workflow with no hidden context.
- Each task is specific enough that a downstream agent can write `SPRINT_CONTRACT.md` without inventing missing product behavior.
- The slice set can narrow work before execution when value does not justify full scope.

### 6. BUILD

Downstream handoff only.

Use the existing Moonshot execution workflow after the plan is accepted.

## Approval Boundary

- Human approval may be used to accept the final planning package before execution begins.
- After execution begins, do not insert additional human checkpoints into implementation -> verification -> retry loops unless a true blocker or external dependency prevents safe continuation.

## Assumptions and Blockers

Do not treat every ambiguity as a stop condition.

Record unresolved items here:
- Assumptions: `{tasksRoot}/{feature-name}/product/ASSUMPTIONS.md`
- Blockers: `{tasksRoot}/{feature-name}/product/BLOCKERS.md`

Rules:
- Move non-critical ambiguity into `ASSUMPTIONS.md`
- Leave only stage-blocking items in `BLOCKERS.md`
- Prefer progress with explicit assumptions over conversational stalls

## Task Slicing Rules

Every task in `product/tasks/*.md` must include:
- Input
- Output
- Done criteria
- Impacted scope
- Upstream dependency
- Parallelizable or not
- Verification method
- Proposed evaluator focus

Prefer vertical slices over layer-only tasks.

Good:
- "Create onboarding draft save flow end-to-end"

Avoid:
- "Build DTOs"
- "Add repository layer"
- "Implement UI shell only"

## Execution Bridge Artifacts

The product-definition workflow still stops before code changes, but downstream build work should start from explicit bridge artifacts rather than jumping straight from `PLAN.md` into implementation.

Recommended downstream artifacts per slice:
- `SPRINT_CONTRACT.md`: what this round will build, non-goals, done checks, and verification method
- `QA_REPORT.md`: evaluator verdict, failed criteria, reproduction notes, and next-round feedback
- `HANDOFF.md`: resume state for long-running or interrupted work

Recommended location:
- `{tasksRoot}/{feature-name}/execution/{slice-name}/`

For medium or complex work, `PLAN.md` and each task file should give enough detail to seed these artifacts without adding speculative scope.

## Handoff Contract to Moonshot

`product-orchestrator` is upstream.
`moonshot-orchestrator` remains the build control plane.

Handoff package:
- `PRODUCT_INTENT.md`
- `PRD.md`
- `SOLUTION.md`
- `SPEC.md`
- `PLAN.md`
- `tasks/*.md`
- `ASSUMPTIONS.md`
- `BLOCKERS.md`

Moonshot should receive paths and summaries, not full inline documents.

## Templates

Use templates in `.claude/templates/product-definition/`:
- `PRODUCT_INTENT.template.md`
- `PRD.template.md`
- `SOLUTION.template.md`
- `SPEC.template.md`
- `ADR.template.md`
- `PLAN.template.md`
- `task.template.md`
- `ASSUMPTIONS.template.md`
- `BLOCKERS.template.md`

For downstream execution artifacts, also use:
- `.claude/templates/execution/SPRINT_CONTRACT.template.md`
- `.claude/templates/execution/QA_REPORT.template.md`
- `.claude/templates/execution/HANDOFF.template.md`
