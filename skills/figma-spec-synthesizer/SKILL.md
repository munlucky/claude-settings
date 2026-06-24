---
name: figma-spec-synthesizer
description: Synthesize implementation-ready UI design specs and planning/policy specs from live Figma files, Figma URLs, node IDs, screenshots, or large Figma planning boards. Use when a user asks to organize Figma design specs, planning specs, product policy specs, interaction states, screen behavior, or update an existing spec from added Figma cases.
---

# Figma Spec Synthesizer

## Role

Turn live Figma design or planning nodes into standalone implementation specs. The output should be detailed enough for a developer to implement ordinary cases without reopening Figma.

This skill is for Figma-first synthesis. Keep static file parsing in `design-asset-parser`.

## Boundaries

Use this skill for:
- Figma design URLs or node IDs
- Figma planning/spec boards
- screenshot-based interpretation of Figma frames
- adding new Figma cases to an existing UI or planning spec
- separating design facts from planning/policy facts

Do not use this skill for:
- generic PDF/CSS/HTML export parsing without live Figma context; use `design-asset-parser`
- visual polish or frontend implementation; use `frontend-design`
- full idea-to-PRD-to-plan workflow; use `product-orchestrator`

When Figma MCP tools require a plugin skill such as `figma-use`, load that tool-specific skill before calling the tool.

## Input Handling

For each Figma URL:
1. Extract `fileKey` from `/design/<fileKey>/...`.
2. Extract `node-id=123-456`.
3. Convert node IDs to Figma API format: `123:456`.
4. Preserve the original URL and converted node ID in the final spec evidence.

Before writing, inspect:
- the user request and target scope
- existing spec files that should be updated
- nearby repo document conventions
- current code/data models when the design depends on fields or API shape

## Evidence Workflow

Do not rely only on generated code, metadata, or text layers. Image analysis is mandatory.

1. Confirm the node
   - Use metadata to verify node name and scope when available.
   - Use design context for hierarchy/style hints when useful.
   - For planning boards, text-layer extraction can help reading order but is only a supplement.

2. Capture visual evidence
   - Use `get_screenshot` for the target node.
   - Use high `maxDimension` for wide planning boards.
   - Use `contentsOnly=false` when labels, surrounding board context, or annotations matter.
   - If Figma MCP hits view-seat/quota limits, use an authenticated browser session and viewport screenshots.
   - If screenshot URL download is blocked by sandbox/network limits, rerun with approved network access or fall back to browser screenshots.

3. Segment large boards
   - Split wide or dense screenshots into semantic or coordinate-based crops.
   - Read left-to-right and top-to-bottom unless the board explicitly shows another flow.
   - Make additional zoom crops for small text, policy tables, alert copy, and annotations.
   - Track enough source detail to cite the Figma node and board section in the spec.

4. Reconcile sources
   - Treat visible UI/copy as primary evidence.
   - Use text layers to reduce transcription errors, not to skip image inspection.
   - Use code/data model checks only to mark implementation assumptions or gaps.

## Synthesis Rules

Separate output by concern:
- UI design spec: screen map, layout, components, variants, copy, interaction states, responsive assumptions, UI data dependencies, QA checklist.
- Planning/policy spec: goal, entry paths, business rules, validation policy, state/exposure rules, cache/refresh rules, API/data requirements, open decisions.

When both concerns are present, write separate docs and cross-link them.

Prefer updating the existing spec when the user says a case was added or asks to update a prior artifact. Patch the relevant state matrix, copy table, policy section, and QA checklist instead of appending an isolated note.

Mark each statement as one of:
- confirmed from Figma
- inferred from surrounding design
- implementation assumption from repo/code
- open question

## Required Coverage

Cover all visible states and variants, including:
- empty, loading, error, success, disabled
- selected/unselected tabs
- own content versus another user's content
- rated versus unrated or partial-rating states
- content exists versus missing content
- first item/first contribution states
- list, detail, popup/modal, and external entry paths when visible

Capture exact visible copy for:
- labels
- CTA buttons
- empty states
- alerts
- toasts
- validation messages
- tab names

Double-check numeric and unit-sensitive rules. Common mistakes include confusing:
- characters versus lines
- minimum versus maximum
- visible truncation versus source copy
- score presence versus recommendation text presence

## UI Spec Template

```markdown
# <Feature> UI Spec

## Source Evidence
| Source | Node | Board/Frame section | Notes |
|--------|------|---------------------|-------|

## Implementation Scope
- Included:
- Excluded:
- Assumptions:

## Screen Map
| Surface | Entry path | Purpose |
|---------|------------|---------|

## UI Structure
### <Screen or Component>
- Layout:
- Main elements:
- Data dependencies:

## State Matrix
| State | Trigger/Data | UI result | Actions | Notes |
|-------|--------------|-----------|---------|-------|

## Copy and Messages
| Context | Exact copy | Condition |
|---------|------------|-----------|

## Interaction Rules
| Action | Enabled when | Result | Error/empty/loading |
|--------|--------------|--------|---------------------|

## Implementation Notes
- Components:
- API/data assumptions:
- QA checklist:

## Open Questions
```

## Planning Spec Template

```markdown
# <Feature> Planning Spec

## Source Evidence
| Source | Node | Board section | Notes |
|--------|------|---------------|-------|

## Goal and User Flow
- Goal:
- Primary users:
- Entry paths:

## Policy Summary
| Area | Rule | Impact |
|------|------|--------|

## State and Exposure Rules
| Scenario | Condition | User-visible behavior | Data/API implication |
|----------|-----------|-----------------------|----------------------|

## Validation and Messaging
| Input/Action | Rule | Message/Toast | Notes |
|--------------|------|---------------|-------|

## Data/API Requirements
| Requirement | Needed fields | Producer/consumer | Open issue |
|-------------|---------------|-------------------|------------|

## Cross-Spec Links
- Related UI spec:
- Related implementation files:

## Development Checklist

## Open Questions
```

## Final Check

Before final response:
1. Re-read modified spec files.
2. Verify every provided Figma node was visually inspected.
3. Verify added cases are integrated into existing sections.
4. Recheck exact Korean copy and numeric limits against screenshots.
5. State whether tests/builds were skipped because the change was documentation only.
