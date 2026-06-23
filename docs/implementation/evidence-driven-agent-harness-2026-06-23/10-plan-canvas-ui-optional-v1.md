# Phase 10 - Plan Canvas UI Optional v1

## Objective

Implement optional plan review canvas rendering as derived output, not as source truth.

## Dependencies

- Phase 07.

## Owned Paths

- `tools/plan-canvas/`
- `schemas/plan-feedback.schema.json`
- `tests/plan-canvas-contract.test.mjs`
- `docs/public/guidelines/plan-review-canvas.md`

## Read-only Paths

- `docs/implementation/**`
- `schemas/plan-graph.schema.json`
- `package/package-contract.yaml`

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P10-1 | Render Markdown/YAML plan package into static HTML or local UI artifact. | Derived canvas |
| P10-2 | Capture element-level feedback in `feedback.json`. | Feedback schema |
| P10-3 | Apply feedback through explicit plan revision, not direct source mutation by UI. | Revision workflow |

## Acceptance Criteria

- Markdown/YAML remain source truth.
- HTML/canvas output is generated and excluded from package payload unless explicitly approved.
- Feedback application creates a reviewed plan revision.

## Verification Signals

- `node --test tests/plan-canvas-contract.test.mjs`
- `npm test`

## Review-Improvement Loop

- Review focus: generated-vs-source confusion, package payload leakage, irreversible UI edits.
- Re-review trigger: canvas output becomes packaged or affects source plan mutation.

## Phase 10 Closeout

Status: complete

Implemented:
- Added `tools/plan-canvas/plan-canvas.mjs` with render, feedback, and revision-proposal commands.
- Added generated HTML canvas rendering that names Markdown/YAML as source truth.
- Added structured `PLAN_CANVAS_FEEDBACK` schema and revision proposal output that does not mutate source.
- Added public guideline documenting generated-vs-source boundaries.
- Added package dry-run guard proving generated `.moonshot-relay/plan-canvas/**` artifacts are not packaged.

Verification:
- `node --test tests\plan-canvas-contract.test.mjs tests\syntax-schema-contract.test.mjs`
- `node --check tools\plan-canvas\plan-canvas.mjs`
