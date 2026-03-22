# Context Readiness Schema

Use this schema for downstream project `context.md` files before implementation begins.

## Minimum Required Sections

```markdown
## Goal
- One-sentence task objective

## Constraints
- Key rules, architecture limits, compatibility constraints

## Acceptance Criteria
- Objective completion checks

## Out of Scope
- Explicit exclusions

## Target Files
- New files
- Modified files

## Verification Plan
- Commands to run
- Manual/runtime checks
```

## Rules
- Keep the minimum schema concise.
- Add detailed phase plans only after the minimum sections exist.
- `context-readiness-gate` uses this schema to decide whether implementation may start.
- `meta_harness` work in this repository is exempt from this downstream schema.
