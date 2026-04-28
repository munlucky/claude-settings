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
- `PRD.md`
- Relevant assumptions and blockers

## Output

Write one task file per vertical slice under:
- `{tasksRoot}/{feature-name}/product/tasks/`

Each task must follow `task.template.md`.

## Required Fields Per Task

- Goal
- Requirement IDs (`REQ-*`)
- Scenario IDs (`SCN-*`)
- Input
- Output
- Scope
- Dependencies
- Parallelization
- Done criteria
- Verification
- Rollback or risk
- Exact files to create/modify/test
- Exact commands to run
- Expected fail/pass signals
- Blocker condition
- Review checkpoint
- Verification evidence path

## Slicing Rules

Prefer:
- user-visible end-to-end increments
- thin slices that exercise multiple layers only when needed
- tasks that can be owned and verified independently
- slices whose `REQ-*` and `SCN-*` coverage can be verified without guesswork
- tracer-bullet slices that prove one complete behavior path at a time
- AFK slices when implementation can proceed without human judgment
- HITL slices only when a real decision, design review, or external approval is required

Avoid:
- pure layer splits with no user outcome
- giant umbrella tasks
- tasks that require hidden context from other slices
- horizontal batches such as "all schema", "all API", then "all UI" when a vertical slice is possible

## Parallel Group Rules

Assign a simple parallel group label when useful:
- `G1`, `G2`, `G3`

Only group tasks in parallel when:
- they do not mutate the same contract
- they do not depend on the same unfinished artifact
- their verification can run independently

## Optional GitHub Issue Export Contract

When the workflow exports task slices to GitHub issues, keep issue bodies durable and behavior-focused:

- create issues in dependency order
- include `AFK` or `HITL`
- include parent plan or source issue when available
- describe what to build as end-to-end behavior, not layer-by-layer file edits
- include acceptance criteria and verification commands
- avoid file paths, line numbers, and implementation snippets unless the user explicitly asks for tactical tickets
- use `Blocked by` with real issue numbers when available, otherwise plain dependency names

Issue body shape:

```markdown
## What to build

## Type

AFK or HITL

## Acceptance criteria

- [ ] ...

## Verification

## Blocked by
```

## Handoff Quality Bar

A good task file allows an implementation agent to start work with:
- no extra planning
- no scope invention
- a clear completion test
- explicit traceability targets for completion gating
- exact file and command targets
- explicit fail/pass evidence expectations
- a clear AFK/HITL classification when the slice may leave local documents

## References

- `.claude/docs/guidelines/product-definition-workflow.md`
- `.claude/templates/product-definition/task.template.md`
