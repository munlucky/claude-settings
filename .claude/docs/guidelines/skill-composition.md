# Skill Composition Guide

> Use composition bundles to keep sequence logic short and readable.

## When to Consider Skill Composition

- Same skill combination repeated in 3+ places
- Total skill count exceeds 30
- Onboarding new team members becomes difficult

## Active Composition Bundles

The orchestrator and sequence planner should prefer bundle selection over long flat step lists.

## Stage Model

Use the following stage order for non-trivial implementation work:

1. Intake
2. Plan
3. Ready / Isolate
4. Execute
5. Review
6. Verify
7. Finish / Handoff

Default expectation:
- medium, complex, and phase-based work should visibly pass through these stages
- small bounded work may compress stages, but should still preserve review/verification discipline when risk warrants it

## Public Entrypoints

Source of truth:
- Public entrypoint metadata, stage order, execution-mode defaults, fallback boundaries, and skill line budgets are defined in `.claude/workflow.registry.yaml`.
- This guide explains composition behavior. It must not duplicate or override registry fields.
- `agent-loop.mjs` is a legacy/headless/cron fallback adapter, not the primary control plane for phase work.

Primary public workflow entrypoints:

- `product-orchestrator`: raw idea to bounded product package
- `moonshot-phase-runner`: large, phase-based, or long-running implementation work
- `moonshot-orchestrator`: bounded implementation work outside the phase harness

Supplemental public utility entrypoints:

- `session-logger`: explicit session or handoff logging on demand
- `commit-moonshot`: explicit project-memory update plus commit flow

## Skill Simplification Contract

`SKILL.md` files are routing and execution contracts, not incident archives.

Line budgets:
- public entrypoints: target <= 180 lines
- internal stage owners and optional bundle members: target <= 120 lines
- anything larger must justify why the extra text is required at trigger time

The numeric budgets above are descriptive copies of `.claude/workflow.registry.yaml`; update the registry first, then refresh this guide.

When a skill exceeds budget, simplify in this order:
1. Keep trigger, routing, hard gates, required inputs, and output artifacts in `SKILL.md`.
2. Move examples, incident taxonomy, long policy explanations, and command matrices to `deepReferences`.
3. Merge repeated stage sequencing into this composition guide instead of duplicating it in each skill.
4. Prefer tightening an existing owner over adding a new public skill.

Run the local-history audit before non-trivial harness or skill-surface changes:

```bash
node .claude/scripts/harness-bottleneck-audit.mjs
```

The audit reads the current repository plus local Codex memory at `~/.codex/memories/MEMORY.md`, then reports recurring bottleneck categories, oversized skills, and `.codex/skills` mirror drift.

## MemoryGraph Stage Contract

All public workflow entrypoints must apply `.claude/docs/guidelines/memorygraph-workflow.md`.

Default behavior:
- run `project-memory-agent` in read-only mode during Intake before delegating planning, review, execution, or logging work
- refresh stage-scoped `projectMemoryContext` before Plan, Execute, Verify, and Finish stages when the workflow is non-trivial
- run `project-memory-check` before the first implementation step
- run `project-memory-reviewer` after `codex-review-code`
- store compact reusable facts only through `session-logger`, `commit-moonshot`, or an explicit memory-refresh request
- exclude `.claude/docs/ko/` from MemoryGraph load/store paths

Dedupe rule:
- If MemoryGraph repeats system, developer, `AGENTS.md`, `.claude/rules/**`, or workflow hard rules, omit the duplicate from `deltas` and record it under `projectMemory.omitted.duplicatedSystemRules`.

### memory-intake-bundle
Required first bundle for public workflow entrypoints unless the request is clearly self-contained and read-only.

```yaml
steps:
  - project-memory-agent (stage=intake, read_only)
```

Do not present the following as primary user entrypoints:

- `moonshot-phase-executor`
- analysis micro-skills
- readiness gates
- document operation helpers

## Surface Status

Use these visibility values when refreshing skill metadata or workflow docs:

```yaml
surfaceStatus:
  public_entrypoint: "May be selected directly as a workflow entrypoint."
  public_utility: "May be invoked directly only for its explicit utility task."
  internal_stage_owner: "Owned by a stage or orchestrator; do not present as a user entrypoint."
  optional_bundle_member: "Loaded only when the current task profile needs the bundle."
  deprecated: "Retained for compatibility or historical reference; not part of default flow."
```

Default routing:
- users enter through `public_entrypoint` skills
- orchestrators and bundles may call `internal_stage_owner` skills
- task profiles may add `optional_bundle_member` skills
- `deprecated` skills require explicit maintenance or historical-analysis intent

## Composition Ownership

- analysis micro-skills exist to support orchestrators, not to widen direct user invocation
- ready/isolate helpers should run as a named pre-execution stage, not only as hidden gates
- review helpers should run behind a dedicated review stage
- verification helpers should run behind a dedicated verify stage
- documentation and session helpers should run behind a finish-stage bundle
- stack-specific UI helpers should sit under `frontend-design`
- `session-logger` may still be invoked directly as a public utility
- `commit-moonshot` may still be invoked directly as a public utility

## Skill Layer Taxonomy

Use these three layers to keep skill growth manageable:

- `orchestrator`
  - chooses sequence, verdict routing, or team topology
- `agent_extending`
  - adds domain knowledge or reusable behavior to an execution path
- `external_interface`
  - connects the workflow to external tools, runtime checks, or services

Recommended frontmatter fields for new or refreshed skills:

```yaml
layer: orchestrator|agent_extending|external_interface
loads:
  - short context label
deepReferences:
  - path/to/reference.md
outputArtifacts:
  - artifact-name
```

Preferred body order:

1. summary
2. routing rules
3. execution contract
4. deep references

### analysis-bundle
Internal only. This bundle supports orchestrator analysis and must not widen the public invocation surface.

```yaml
steps:
  - moonshot-classify-task
  - moonshot-evaluate-complexity
  - moonshot-detect-uncertainty
  - moonshot-decide-sequence
```

### planning-bundle
```yaml
steps:
  - requirements-analyzer
  - context-builder
  - moonshot-plan-writer (if no safe phase plan exists)
  - plan-ceo-review (for value/scope review on PLAN-like artifacts)
  - plan-eng-review (for architecture/readiness review on SPEC/PLAN-like artifacts)
  - task-slicer (if plan output must be decomposed into slices)
  - codex-validate-plan
```

### ready-isolate-bundle
Adapted pattern: this is the local equivalent of `using-git-worktrees`.
Treat it as a visible preparation stage before implementation, not only as a hidden guardrail.
When downstream projects ignore `.claude`, `.agents`, or `.codex`, prepare a hydrated worktree with `harness-prepare-worktree` before passing this gate.

```yaml
steps:
  - pre-flight-check
  - project-contract-gate
  - context-readiness-gate
  - verification-contract-gate
  - workspace-isolation-gate (if strict or implementation is about to start)
```

### implementation-bundle
Adapted pattern: this is the local equivalent of `executing-plans`.
Before implementation, the owner should critique the active plan, stop on blockers, and then execute explicit tasks.
For behavior-changing work, use `test-driven-development` before production code changes.

```yaml
steps:
  - project-memory-check
  - karpathy-execution-gate
  - test-driven-development (if behaviorChanging)
  - implementation-runner
  - code-simplifier
```

### review-bundle
Adapted pattern: this is the local equivalent of `requesting-code-review`.
For medium, complex, or batch work, run review repeatedly at task or batch boundaries instead of only at the end.

```yaml
steps:
  - codex-review-code
  - project-memory-reviewer
  - security-reviewer (if hasSecurityChanges)
  - audit (if uiQualityAuditRequested)
  - web-design-guidelines (if explicit UI/UX review is requested)
```

### verification-bundle
Adapted pattern: this is the local equivalent of `verification-before-completion`.
Fresh verification evidence is mandatory before any completion claim.

```yaml
steps:
  - project-memory-agent (stage=verify, read_only)
  - browser-verifier (if webRuntimeCheckNeeded)
  - qa-flow (if guided runtime QA is requested)
  - completion-verifier
  - verification-evidence-gate (if strict)
```

### finish-bundle
Adapted pattern: this is the local equivalent of `finishing-a-development-branch`.
Finish is a decision stage: record evidence, handoff state, and optional commit intent; do not treat it as loose logging.

```yaml
steps:
  - project-memory-agent (stage=finish, read_only)
  - doc-auto-sync
  - session-logger
  - commit-moonshot (if the user explicitly requests memory update plus commit)
```

### verification-suite
```yaml
steps:
  - review-bundle
  - verification-bundle
```

`verification-suite` is a compatibility alias for older compositions that still think in review-plus-verify as one block.

### doc-ops-bundle
Optional bundle. Use this for documentation/session maintenance work, not as a default implementation entrypoint.

```yaml
steps:
  - doc-auto-sync
  - session-logger
  - documentation-agent
```

Use `finish-bundle` as the default closeout stage for implementation runs that changed meaningful files.
Use `doc-ops-bundle` when the work is primarily documentation/session finalization rather than full finish-stage closure.

### logging-bundle
```yaml
steps:
  - session-logger
```

`logging-bundle` is a legacy alias kept for migration safety.

### implementation-with-recovery
```yaml
steps:
  - implementation-runner
  - on_error:
      - failure-analyzer (root cause first)
      - build-error-resolver
      - retry: implementation-runner (max: 2)
```

Recovery rule:
- do not patch before root-cause evidence exists
- if the same `failureClass` appears twice, change tactic before retry
- after three failed attempts, escalate to design/contract review instead of continuing blind fixes

### meta-harness-bundle
```yaml
steps:
  - project-memory-agent (stage=intake, read_only)
  - pre-flight-check
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
  - completion-verifier
```

## Rules

- Tier 1 entrypoints choose bundles; bundles should not widen the public invocation surface.
- Do not add new default public entrypoints without updating this document and the skill inventory.
- `product_project` work may use `ready-isolate-bundle`.
- Large or phase-based work should enter through `moonshot-phase-runner`, not `moonshot-orchestrator`.
- Medium/complex implementation should pass through `ready-isolate-bundle -> implementation-bundle -> review-bundle -> verification-bundle -> finish-bundle`.
- Small bounded work may compress stages, but it must not skip evidence before completion when files changed.
- Use `review-bundle` before `verification-bundle` for non-trivial code changes.
- Prefer `finish-bundle` for implementation closeout and `doc-ops-bundle` for documentation/session-only work.
- `commit-moonshot` remains an explicit user-triggered utility and should not be assumed automatically.
- `meta_harness` work must skip downstream bootstrap gates.
- Strict profile overlays are applied after bundle expansion, not inside individual bundles.
- When a bundle expands to no-op for the current plane, record that explicitly in notes.

## Documentation Consistency Checks

Use these checks after changing workflow docs or skill metadata:

```bash
rg -n "efficiency-tracker|workflow-self-improver" README.md .claude/README.md .claude/docs/guidelines
rg -n "public entrypoint|Primary public workflow entrypoints|Workflow Stage Map" README.md .claude/README.md .claude/docs/guidelines
find .claude/skills -maxdepth 2 -name SKILL.md -print
.claude/scripts/knowledge-repo-audit.sh
```

The first command may mention deprecated skills only as archived deprecated/non-default assets.
The public entrypoint list must remain limited to `product-orchestrator`, `moonshot-phase-runner`, and `moonshot-orchestrator`.

## References

- `.claude/skills/moonshot-decide-sequence/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`
- `.claude/docs/guidelines/team-observability.md`
