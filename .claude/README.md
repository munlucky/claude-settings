# Moonshot Workflow Guide

> This document describes the Moonshot workflow components in this repository. For project-specific rules, see `.claude/PROJECT.md`.

## Entry Points

- Global rules: `.claude/CLAUDE.md` (use `@` imports when needed)
- Modular rules: `.claude/rules/`
- Project rules: `.claude/PROJECT.md`
- Agent format: `.claude/CLAUDE.md`
- Orchestrator skill: `.claude/skills/moonshot-orchestrator/SKILL.md`

## Memory Model and Priority

Claude Code loads memories in the following order (higher is more general, lower is more specific).

| Memory Type | Location | Purpose | Shared With |
| --- | --- | --- | --- |
| Enterprise policy | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`<br />Linux: `/etc/claude-code/CLAUDE.md`<br />Windows: `C:\Program Files\ClaudeCode\CLAUDE.md` | Organization-wide rules | Entire organization |
| Project memory | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Project-wide rules | Team via source control |
| Project rules | `./.claude/rules/*.md` | Modular project rules | Team via source control |
| User memory | `~/.claude/CLAUDE.md` | Personal defaults | Personal |
| Project memory (local) | `./CLAUDE.local.md` | Personal project preferences | Personal |

- `CLAUDE.local.md` is automatically added to `.gitignore`.

## Memory Loading and Editing

- At launch, Claude Code walks up from the cwd and loads any `CLAUDE.md` or `CLAUDE.local.md` files it finds.
- Nested `CLAUDE.md` files under the current working directory are loaded only when files in those subtrees are accessed.
- Use `/memory` to inspect or edit loaded memories, and `/init` to bootstrap a `CLAUDE.md`.

## CLAUDE.md imports

You can import additional files using the `@path/to/import` syntax.

```
See @README for project overview and @package.json for npm commands.

# Additional Instructions
- git workflow @docs/git-instructions.md
```

- Both relative and absolute paths are supported (example: `@~/.claude/my-project-instructions.md`).
- Imports are not evaluated inside code spans or code blocks.
- Import depth is limited to 5 hops.

## Modular Rules (rules/)

All `.md` files under `.claude/rules/` are loaded automatically (recursive).

- User rules in `~/.claude/rules/` load first.
- You can share rules via symlinks when needed.

- `basic-principles.md`: core principles
- `workflow.md`: work execution
- `context-management.md`: context management
- `quality.md`: verification and quality
- `communication.md`: communication
- `output-format.md`: output format

### Path-specific rules

- `rules/skills/skill-definition.md`: skill definition rules (`.claude/skills/**/*.md`)
- `rules/agents/agent-definition.md`: agent definition rules (`.claude/agents/**/*.md`)
- `rules/docs/documentation.md`: documentation rules (`.claude/docs/**/*.md`)
- `paths` supports standard glob patterns and multiple entries.

## Agents

- Requirements Analyzer: `.claude/agents/requirements-analyzer.md`
- Context Builder: `.claude/agents/context-builder.md`
- Implementation Agent: `.claude/agents/implementation-agent.md`
- Verification Agent: `.claude/agents/verification-agent.md`
- Documentation Agent: `.claude/agents/documentation-agent.md`
- Design Spec Extractor: `.claude/agents/design-spec-extractor.md`
- Verification script: `.claude/agents/verification/verify-changes.sh`

## Skills

### Product Definition
- `product-orchestrator`
- `product-gate-reviewer`
- `task-slicer`
- `assumption-ledger`

### Moonshot Analysis
- `moonshot-classify-task`
- `moonshot-evaluate-complexity`
- `moonshot-detect-uncertainty`
- `moonshot-decide-sequence`

### Execution and Verification
- `frontend-design`
- `pre-flight-check`
- `design-approval-gate` (NEW, strict profile)
- `workspace-isolation-gate` (NEW, strict profile)
- `karpathy-execution-gate` (NEW)
- `implementation-runner`
- `completion-verifier` (NEW)
- `verification-evidence-gate` (NEW, strict profile)
- `codex-validate-plan`
- `codex-review-code`
- `moonshot-in-session-coordinator` (NEW)

### Documentation and Logging
- `session-logger`
- `efficiency-tracker`

### Utilities
- `teach-impeccable`
- `audit`
- `normalize`
- `polish`
- `design-asset-parser`
- `project-md-refresh`
- `security-reviewer`
- `build-error-resolver`

## Typical Flow (Example)

1. `product-orchestrator` converts an idea into `PRODUCT_INTENT -> PRD -> SOLUTION -> SPEC -> PLAN`.
2. `product-gate-reviewer` decides `pass`, `conditional_pass`, or `fail` at each stage.
3. `task-slicer` decomposes `PLAN.md` into independently executable `tasks/*.md`.
4. Before medium/complex implementation starts, create a slice-level `SPRINT_CONTRACT.md` so the build round has explicit done checks and non-goals.
5. `moonshot-orchestrator` receives the product package and builds the implementation chain.
6. For complex tasks, validate the plan with `codex-validate-plan`, then run `karpathy-execution-gate` before `implementation-runner`.
7. For React/web UI implementation, `frontend-design` can be injected before `implementation-runner`; if design context is missing, run `teach-impeccable` first.
8. Use a separate evaluator path such as `completion-verifier`, `browser-verifier`, `verify-changes.sh`, or `verify-runtime.sh` and record the result in `QA_REPORT.md`.
9. If the work spans multiple sessions, leave a resumable `HANDOFF.md`.
10. `documentation-agent` finalizes docs and calls `doc-sync` when needed.

Unified phase execution boundary:
- `/moonshot-phase-runner <plan-dir>` is the user-facing entrypoint.
- `moonshot-phase-executor` is the skill-level execution adapter.
- Internal command adapters may still use `.claude/scripts/moonshot-phase-dispatch.sh`.
- Runtime selection remains `auto|claude|codex`.

Phase runner default behavior:
- `/moonshot-phase-runner <plan-dir>` now prepares artifacts and immediately starts `moonshot-phase-executor`.
- Use `--prepare-only` only when you explicitly want to stop after preparation.

## Docs and Templates

- Keep task docs under `.claude/docs` following `.claude/PROJECT.md` path rules.
- Output templates: `.claude/templates/moonshot-output.md`, `.claude/templates/moonshot-output.ko.md`, `.claude/templates/moonshot-output.yaml`.
- Product-definition guide: `.claude/docs/guidelines/product-definition-workflow.md`.
- Long-running harness guide: `.claude/docs/guidelines/long-running-harness.md`.
- Product-definition templates: `.claude/templates/product-definition/`.
- Execution artifact templates: `.claude/templates/execution/`.

## Maintenance Notes (This Repo)

- Keep English `.md` in ASCII and maintain matching `.ko.md` pairs.
- If you change names or paths, update this document and `install-claude.sh`.
- If the target project is missing `PROJECT.md`, run `project-md-refresh`.
