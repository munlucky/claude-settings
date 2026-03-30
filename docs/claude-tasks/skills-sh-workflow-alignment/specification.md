# Skills.sh Workflow Alignment Preparation Specification

Last-Reviewed: 2026-03-27

## Objective

Define the exact preparation steps required before changing workflow docs, rules, bundles, or skill metadata in response to the `skills.sh` benchmark.

This document ends at the change gate.

## Target Stage Model

The preparation work assumes the future workflow should be expressed through seven stages:

1. Intake
2. Plan
3. Ready / Isolate
4. Execute
5. Review
6. Verify
7. Finish / Handoff

## Proposed Local Stage Owners

| Stage | Primary Local Owners | Notes |
|---|---|---|
| Intake | `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator` | Keep the current three-entrypoint policy. |
| Plan | `requirements-analyzer`, `context-builder`, `moonshot-plan-writer`, `task-slicer`, `codex-validate-plan` | Covers plan authoring, slicing, and critique. |
| Ready / Isolate | `pre-flight-check`, `project-contract-gate`, `context-readiness-gate`, `verification-contract-gate`, `workspace-isolation-gate` | Must become more visible as a normal stage. |
| Execute | `karpathy-execution-gate`, `implementation-runner`, `build-error-resolver`, `moonshot-phase-executor`, `moonshot-in-session-coordinator`, `moonshot-teams-runner` | Execution owners already exist; surfacing and boundary cleanup matter more than capability. |
| Review | `codex-review-code`, `security-reviewer`, `audit`, `web-design-guidelines` | Review cadence and scope rules must be clearer. |
| Verify | `browser-verifier`, `qa-flow`, `completion-verifier`, `verification-evidence-gate` | Strong local stage that should stay strict. |
| Finish / Handoff | `doc-auto-sync`, `session-logger`, `commit-moonshot` | Needs a more explicit decision flow and default closeout contract. |

## Phases

### Phase 0. Lock The Benchmark

Goal:
- reduce the `skills.sh` review into explicit patterns the local repo should copy, adapt, or reject

Actions:
- keep only patterns with clear operating value
- separate stage-model lessons from repo-agnostic style advice
- note where external patterns conflict with current local constraints

Outputs:
- `benchmark.md`

Exit criteria:
- no benchmark item remains as a vague inspiration only

### Phase 1. Build The Stage Map

Goal:
- create one authoritative workflow view for the local repo

Actions:
- assign every important current workflow asset to one primary stage
- distinguish user-facing entrypoints from internal stage owners
- declare mandatory stages for medium and complex work

Outputs:
- stage-owner table in `specification.md`

Exit criteria:
- every target stage has declared owners

### Phase 2. Decide Per-Asset Upgrade Mode

Goal:
- define how current assets should be changed without over-scoping implementation

Allowed modes:
- `keep`
- `re-describe`
- `re-bundle`
- `tighten-trigger`
- `promote-stage`
- `defer`

Actions:
- use `re-describe` when capability is fine but discoverability is weak
- use `re-bundle` when stage ownership exists but is too scattered
- use `promote-stage` when a hidden guardrail should become a visible workflow step
- use `defer` when change would require runtime behavior edits

Outputs:
- per-stage upgrade notes in `change-package.md`

Exit criteria:
- every target area has one declared upgrade mode

### Phase 3. Prepare Wave 1 File Scope

Goal:
- bound the first implementation pass to safe documentation and metadata changes

Actions:
- list docs and rules that must change first
- list the minimum skill docs whose descriptions or visibility notes must change
- keep shell scripts and runtime dispatch out of Wave 1

Outputs:
- Wave 1 file list in `change-package.md`

Exit criteria:
- the first pass can be executed without touching runtime adapters

### Phase 4. Define Validation For The Future Change

Goal:
- declare how the eventual implementation pass will be judged

Actions:
- require one visible stage map in public docs
- require explicit review and finish stage guidance
- require trigger-oriented skill descriptions for targeted skills
- require verification discipline to stay explicit

Outputs:
- success criteria section in `change-package.md`

Exit criteria:
- implementation can be reviewed against objective workflow outcomes

## Rules

- do not add new default public entrypoints during preparation
- do not weaken evidence-before-completion rules
- do not change runtime dispatch in Wave 1
- do not merge unrelated architecture cleanup into the first workflow pass

## First Implementation Boundary

Wave 1 should usually change:

- `.claude/README.md`
- `.claude/rules/workflow.md`
- `.claude/docs/guidelines/skill-composition.md`
- selected `SKILL.md` and `SKILL.ko.md` files for stage visibility and trigger quality

Wave 1 should not start with:

- script rewrites
- branch automation changes
- mass skill renames
- deletions of current workflow assets
