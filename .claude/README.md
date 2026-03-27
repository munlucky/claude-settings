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

## Workflow Stage Map

Use one visible stage model across the repo:

| Stage | Default owners | Purpose |
| --- | --- | --- |
| Intake | `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator` | Choose the correct public entrypoint from the request shape. |
| Plan | `product-orchestrator`, `moonshot-plan-writer`, `task-slicer`, `codex-validate-plan` | Produce executable plans and slice them before implementation. |
| Ready / Isolate | `pre-flight-check`, `project-contract-gate`, `context-readiness-gate`, `verification-contract-gate`, `workspace-isolation-gate` | Confirm readiness, contract coverage, and isolated execution setup. |
| Execute | `implementation-runner`, `build-error-resolver`, `moonshot-phase-executor`, `moonshot-in-session-coordinator`, `moonshot-teams-runner` | Perform the implementation work and recover from build failures when needed. |
| Review | `codex-review-code`, `security-reviewer`, `audit`, `web-design-guidelines` | Run focused review before completion claims, especially for non-trivial changes. |
| Verify | `browser-verifier`, `qa-flow`, `completion-verifier`, `verification-evidence-gate` | Produce fresh runtime/test evidence and block unsupported completion claims. |
| Finish / Handoff | `doc-auto-sync`, `session-logger`, `commit-moonshot` | Finalize docs, log the session, and optionally commit when explicitly requested. |

For medium, complex, or phase-based work, treat these stages as the default path.
Bounded low-risk work may compress stages, but should not skip review or verification when the change profile still warrants them.

## Typical Flow (Stage-Oriented Example)

1. Intake:
   - Use `product-orchestrator` when the request is still idea-to-plan.
   - Use `moonshot-phase-runner` for large or phase-driven implementation work.
   - Use `moonshot-orchestrator` for bounded implementation work that already has enough context.
2. Plan:
   - Create or refresh the plan package with `moonshot-plan-writer` and `task-slicer` as needed.
   - Run `codex-validate-plan` before implementation for complex or high-risk work.
3. Ready / Isolate:
   - Run readiness gates before implementation starts.
   - In strict runs, do not begin implementation until `workspace-isolation-gate` has enough isolation evidence.
4. Execute:
   - Run `karpathy-execution-gate` before `implementation-runner`.
   - Use `build-error-resolver` only as a recovery path, not as a default entrypoint.
   - Inject stack-specific helpers such as `frontend-design` when the work requires them.
5. Review:
   - Treat review as a first-class stage, not a postscript.
   - Use `codex-review-code` for non-trivial code changes and add targeted review helpers when needed.
6. Verify:
   - Use `browser-verifier`, `verify-changes.sh`, `verify-runtime.sh`, or `completion-verifier` as applicable.
   - In strict runs, `verification-evidence-gate` must pass before any completion claim.
7. Finish / Handoff:
   - Record the outcome in `QA_REPORT.md` and leave `HANDOFF.md` when the work spans sessions.
   - Finalize docs and session logs.
   - Use `commit-moonshot` only when the user explicitly wants memory update plus commit.

Unified phase execution boundary:
- `/moonshot-phase-runner <plan-dir>` is the user-facing entrypoint.
- `moonshot-phase-executor` is the skill-level execution adapter.
- Internal command adapters may still use `.claude/scripts/moonshot-phase-dispatch.sh`.
- Runtime selection remains `auto|claude|codex`.

Phase runner default behavior:
- `/moonshot-phase-runner` without arguments first tries to reuse an existing safe plan dir.
- If no safe plan dir exists, it bootstraps `docs/implementation` through `moonshot-plan-writer`.
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
- If the target project is missing its bootstrap docs, run `project-md-refresh`.
- `project-md-refresh` should refresh `.claude/PROJECT.md` together with `workflow/README.md`, `docs/design/README.md`, `docs/glossary/README.md`, `docs/daily/README.md`, `TEST_GUIDE.md`, and `docs/analysis/README.md`.
