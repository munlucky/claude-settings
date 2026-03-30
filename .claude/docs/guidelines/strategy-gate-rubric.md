# Strategy Gate Rubric

> Durable decision rubric for planning-stage strategy gates.

Last-Reviewed: 2026-03-30

## Purpose

Use this rubric for planning-stage review skills that decide whether work should proceed, narrow, hold, or fail before implementation begins.

This document is the durable source for:

- `plan-ceo-review`
- `plan-eng-review`

It replaces task-doc-only guidance that originated in harness exploration work.

## Gate Split

### CEO Gate

Use for product value, timing, and scope discipline.

Primary questions:

1. Why should this work happen now?
2. What user value becomes available if this ships?
3. What is explicitly out of scope?
4. Is the cost justified by the near-term value?
5. Should the scope shrink before execution starts?

Default bias:

- prefer scope reduction over speculative expansion
- prefer a clear core path over broad optional surface area
- treat observability, rollout safety, and support burden as part of scope cost

### ENG Gate

Use for architecture integrity, dependency clarity, and execution readiness.

Primary questions:

1. Are responsibility boundaries explicit?
2. Are dependency order and ownership clear?
3. Is verification defined for the planned work?
4. Does the plan avoid hidden invention during implementation?
5. Is technical risk caused by oversized scope?

Default bias:

- reject plans that require major design invention mid-execution
- prefer explicit interfaces over implicit coordination
- prefer scope reduction when technical risk is breadth-driven

## Verdict Semantics

Return exactly one of:

- `pass`: the artifact is actionable and defensible without major change
- `conditional_pass`: proceed only after bounded clarifications or edits
- `scope_reduction`: narrow the work before execution
- `hold_scope`: stop and re-evaluate timing, value, or readiness
- `fail`: do not proceed in the current form

## Decision Rules

- Completeness is not enough. A complete plan can still fail value or readiness.
- Missing verification means an implementation-bound plan should not receive `pass`.
- Missing non-goals means value review is incomplete.
- Hidden coupling or undefined ownership should downgrade the verdict.
- If uncertainty can be removed by shrinking scope, use `scope_reduction` before `fail`.
- If the core rationale is weak even after shrinking, use `hold_scope` or `fail`.

## Artifact Expectations

### CEO Gate Artifacts

- `PRODUCT_INTENT.md`
- `PRD.md`
- `PLAN.md`
- optional: `ASSUMPTIONS.md`, `BLOCKERS.md`

Minimum acceptable signals:

- clear problem and target user
- explicit non-goals
- cost/benefit argument
- one-line success state

### ENG Gate Artifacts

- `SPEC.md`
- `PLAN.md`
- `tasks/*.md`

Minimum acceptable signals:

- explicit boundaries and owners
- sequencing and dependencies
- verification command or evidence path
- rollback or blast-radius awareness when relevant

## Output Contract

The review result should stay compact and operational:

- `artifact`
- `verdict`
- `summary`
- `requiredChanges`
- `assumptions`
- `blockers`

## References

- `.claude/docs/guidelines/product-definition-workflow.md`
- `.claude/docs/guidelines/skill-composition.md`
- `.claude/docs/guidelines/verification-contract.md`
