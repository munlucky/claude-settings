# Skills.sh Workflow Alignment Change Package

Last-Reviewed: 2026-04-24

## Status

Wave 1 documentation and metadata pass completed.

This package does not change runtime behavior.
It applies selected `skills.sh` operating patterns to the local stage model without bulk-installing production skills.

## Wave 1 Goal

Make the workflow easier to discover and follow without changing the underlying execution plane.

## Wave 1 Change Types

### 1. Promote The Stage Model

Target outcome:
- one visible workflow map covering intake, plan, ready/isolate, execute, review, verify, finish

Upgrade mode:
- `promote-stage`

### 2. Tighten Entrypoint Guidance

Target outcome:
- the three primary public entrypoints remain explicit
- internal helpers stay internal

Upgrade mode:
- `re-describe`

### 3. Re-bundle Review And Finish

Target outcome:
- review becomes a recurring named stage
- finish/handoff becomes a default closeout stage instead of scattered utilities

Upgrade mode:
- `re-bundle`

### 4. Tighten Skill Metadata

Target outcome:
- selected skills use trigger-oriented descriptions
- descriptions stop summarizing internal workflow when that reduces skill-body usage

Upgrade mode:
- `tighten-trigger`

## Wave 1 Target Files

Primary docs and rules:

- `.claude/README.md`
- `.claude/rules/workflow.md`
- `.claude/docs/guidelines/skill-composition.md`
- `.claude/docs/guidelines/skill-composition.ko.md`

Likely skill docs to update first:

- `.claude/skills/product-orchestrator/SKILL.md`
- `.claude/skills/product-orchestrator/SKILL.ko.md`
- `.claude/skills/moonshot-phase-runner/SKILL.md`
- `.claude/skills/moonshot-phase-runner/SKILL.ko.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.ko.md`
- `.claude/skills/moonshot-plan-writer/SKILL.md`
- `.claude/skills/moonshot-plan-writer/SKILL.ko.md`
- `.claude/skills/workspace-isolation-gate/SKILL.md`
- `.claude/skills/workspace-isolation-gate/SKILL.ko.md`
- `.claude/skills/codex-review-code/SKILL.md`
- `.claude/skills/codex-review-code/SKILL.ko.md`
- `.claude/skills/completion-verifier/SKILL.md`
- `.claude/skills/completion-verifier/SKILL.ko.md`
- `.claude/skills/verification-evidence-gate/SKILL.md`
- `.claude/skills/verification-evidence-gate/SKILL.ko.md`
- `.claude/skills/session-logger/SKILL.md`
- `.claude/skills/session-logger/SKILL.ko.md`
- `.claude/skills/commit-moonshot/SKILL.md`
- `.claude/skills/commit-moonshot/SKILL.ko.md`

## Explicit Non-Targets For Wave 1

- `.claude/scripts/**`
- runtime dispatch shell adapters
- installation scripts
- mass file renames
- deletions of existing skills or agents

## Success Criteria

Wave 1 is successful when:

1. A reader can understand the entire workflow through one stage map.
2. Medium and complex work clearly shows where review and finish happen.
3. Isolation is explained as a normal preparation stage, not only as a hidden rule.
4. Selected skill descriptions are more trigger-oriented and easier to discover.
5. Verification and evidence requirements remain explicit and non-optional.
6. No runtime behavior changes are required to accept the documentation pass.

## 2026-04-24 Outcome

- Stage model is visible in `.claude/README.md`, `.claude/README.ko.md`, and `skill-composition` docs.
- Public entrypoints remain limited to the three primary workflow skills plus two public utilities.
- Ready / Isolate, Review, Verify, and Finish / Handoff now explicitly mention the external operating patterns they adapt.
- Targeted skills carry `surfaceStatus` metadata for internal, optional, and deprecated surfaces.
- Bulk `skills.sh` installation is rejected for the default flow; pilot/sandbox review remains allowed.
- External evaluation frameworks are deferred as regression-plane candidates, not runtime dependencies.

## Pilot Policy

If an external skill or harness is tested later:
- run it outside production `.claude/skills`
- record whether the outcome is `adopt`, `adapt`, `reject`, or `defer`
- port only the local strategy or checklist unless the skill is proven safe and non-overlapping
- do not add a new public entrypoint without updating `skill-composition` and the skill architecture inventory

## Likely Follow-Up After Wave 1

Possible Wave 2 work, only if Wave 1 reveals it is necessary:

- add a dedicated workflow-stage guideline if the existing docs become overloaded
- define an explicit local review cadence contract by work size
- define a structured finish/handoff decision flow
- revisit whether any internal helper should become a wrapper instead of a raw micro-skill

## Rollback Boundary

Wave 1 is rollback-safe when limited to:

- documentation files
- rule wording
- skill descriptions
- stage visibility notes

Wave 1 stops being rollback-safe if it expands into:

- runtime dispatch changes
- automatic worktree/bootstrap behavior
- script-based orchestration changes
