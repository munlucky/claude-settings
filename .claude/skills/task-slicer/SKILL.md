---
name: task-slicer
description: Split an execution plan into independently executable vertical-slice task documents.
---

# Task Slicer

## Role

Convert `PLAN.md` into `tasks/*.md` files that can be handed directly to the implementation workflow.

This is not a formatting pass.
This is an execution decomposition pass.

## Input

- `PLAN.md`
- `SPEC.md`
- `SOLUTION.md`
- Relevant assumptions and blockers

## Output

Write one task file per vertical slice under:
- `{tasksRoot}/{feature-name}/product/tasks/`

Each task must follow `task.template.md`.

## Required Fields Per Task

- Goal
- Input
- Output
- Scope
- Dependencies
- Parallelization
- Done criteria
- Verification
- Rollback or risk

## Slicing Rules

Prefer:
- user-visible end-to-end increments
- thin slices that exercise multiple layers only when needed
- tasks that can be owned and verified independently

Avoid:
- pure layer splits with no user outcome
- giant umbrella tasks
- tasks that require hidden context from other slices

## Parallel Group Rules

Assign a simple parallel group label when useful:
- `G1`, `G2`, `G3`

Only group tasks in parallel when:
- they do not mutate the same contract
- they do not depend on the same unfinished artifact
- their verification can run independently

## Handoff Quality Bar

A good task file allows an implementation agent to start work with:
- no extra planning
- no scope invention
- a clear completion test

## References

- `.claude/docs/guidelines/product-definition-workflow.md`
- `.claude/templates/product-definition/task.template.md`
