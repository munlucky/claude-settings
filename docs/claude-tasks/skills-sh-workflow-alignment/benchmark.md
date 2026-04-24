# Skills.sh Workflow Alignment Benchmark

Last-Reviewed: 2026-04-24

## Purpose

Capture the external workflow patterns worth adapting from `skills.sh`, then map them onto the current local workflow assets.

## Sources

Reviewed on 2026-03-27:

- [skills.sh home](https://skills.sh/)
- [obra/superpowers collection](https://skills.sh/obra/superpowers)
- [writing-plans](https://skills.sh/obra/superpowers/writing-plans)
- [executing-plans](https://skills.sh/obra/superpowers/executing-plans)
- [subagent-driven-development](https://skills.sh/obra/superpowers/subagent-driven-development)
- [dispatching-parallel-agents](https://skills.sh/obra/superpowers/dispatching-parallel-agents)
- [requesting-code-review](https://skills.sh/obra/superpowers/requesting-code-review)
- [verification-before-completion](https://skills.sh/obra/superpowers/verification-before-completion)
- [using-git-worktrees](https://skills.sh/obra/superpowers/using-git-worktrees)
- [finishing-a-development-branch](https://skills.sh/obra/superpowers/finishing-a-development-branch)
- [writing-skills](https://skills.sh/obra/superpowers/writing-skills)

## Extracted Workflow Patterns

The benchmark repeatedly emphasizes the same operating model:

1. Plan first, and make the plan executable by someone with near-zero local context.
2. Prepare isolation before implementation begins.
3. Execute against explicit tasks, not fuzzy intent.
4. Review repeatedly during execution, not only at the end.
5. Require fresh verification evidence before any success claim.
6. Finish with a structured branch/handoff flow instead of an open-ended closeout.
7. Keep skill metadata optimized for discovery so the right skill is loaded at the right moment.

## Mapping Matrix

| External Pattern | Local Equivalent | Fit | Preparation Implication |
|---|---|---|---|
| `writing-plans` | `moonshot-plan-writer`, `task-slicer`, `codex-validate-plan` | Partial-strong | Local phase planning is strong, but zero-context execution guidance is still more visible for phase docs than for the broader workflow stage map. |
| `executing-plans` | `moonshot-phase-runner`, `moonshot-phase-executor`, `moonshot-in-session-coordinator` | Partial | Local execution paths exist, but "review plan first, stop on blocker, then execute" should be surfaced more clearly in public workflow docs. |
| `subagent-driven-development` | `moonshot-teams-runner`, `phase-attempt-agent`, `codex-review-code` | Partial | Fresh isolated execution exists, but the two-stage review idea is not yet normalized as a named local stage contract. |
| `dispatching-parallel-agents` | `moonshot-teams-runner`, `parallel-execution.md` | Partial | Parallelism exists, but the criteria for "independent enough to parallelize" should be easier to find and apply. |
| `requesting-code-review` | `codex-review-code`, `security-reviewer` | Partial | Review assets are strong, but mandatory review cadence by task/batch/work size is not expressed as a single rule. |
| `verification-before-completion` | `completion-verifier`, `verification-evidence-gate` | Strong | This is already a local strength and should become a more explicit stage in public workflow guidance. |
| `using-git-worktrees` | `workspace-isolation-gate`, project process docs | Weak-partial | Isolation exists more as a guardrail than as a concrete setup workflow. Preparation should promote it into a visible stage. |
| `finishing-a-development-branch` | `commit-moonshot`, `doc-auto-sync`, `session-logger` | Weak | Local closeout utilities exist, but the finish stage is not presented as a standard decision flow with explicit next actions. |
| `writing-skills` | `rules/skills/skill-definition.md`, current `SKILL.md` structure | Partial | Frontmatter is already simple, but descriptions still vary in trigger quality and sometimes summarize process rather than just when to use the skill. |

## Adoption Decisions

This repository adapts operating patterns rather than bulk-installing production skills.

| External Pattern | Decision | Local Application |
|---|---|---|
| `writing-plans` | Adapt | Strengthen zero-context plan expectations through `moonshot-plan-writer`, `task-slicer`, and `codex-validate-plan`. |
| `using-git-worktrees` | Adapt | Promote Ready / Isolate as a visible stage through `workspace-isolation-gate`; do not add a new worktree runtime in this pass. |
| `executing-plans` | Adapt | Document "critique plan, stop on blocker, execute explicit tasks" in the implementation bundle. |
| `requesting-code-review` | Adapt | Treat review as a recurring stage through `review-bundle`, with task/batch cadence for non-trivial work. |
| `verification-before-completion` | Adopt | Make fresh evidence before completion a non-optional public workflow rule. |
| `finishing-a-development-branch` | Adapt | Convert finish from loose utilities into `finish-bundle` decision flow. |
| SWE-bench `FULL / PARTIAL / NO` | Defer conceptually | Keep current scorecard/verdict runtime; borrow the idea for later status vocabulary only. |
| Terminal-Bench / OpenAI Evals / Inspect | Defer | Treat as future external regression plane candidates, not day-1 runtime dependencies. |
| Bulk `skills.sh` installation | Reject for default flow | Use sandbox/pilot review only; production `.claude/skills` should absorb selected strategies into local skills. |

## Main Benchmark Takeaways

### 1. The missing upgrade is stage visibility

This repository already has many of the required capabilities.
What it lacks is a single visible structure that says:

- which stage comes next
- which skills own that stage
- which stages are mandatory for medium/complex work

### 2. Isolation should be a named stage, not only a gate

`skills.sh` treats isolated workspace/worktree setup as part of normal execution preparation.
The local repo currently has the safety idea, but not yet the same level of stage visibility.

### 3. Review should be recurring, not only terminal

The strongest external pattern is not merely "do review".
It is "do review at the right cadence with focused context".

### 4. Finish needs structure

The local workflow is good at entering work and verifying work.
It is less explicit about the standardized end state after successful verification.

### 5. Skill metadata quality affects workflow quality

`writing-skills` makes a useful point: if the description field summarizes process, the model may stop there and skip the actual skill body.
That makes metadata cleanup part of workflow cleanup, not cosmetic polish.

## Gap Summary

- Stage-oriented workflow map exists in public docs; ongoing work is consistency and drift control.
- Isolation is now promoted as Ready / Isolate, but concrete worktree setup automation remains deferred.
- Review cadence is represented through `review-bundle`; stricter work-size policy can be added later.
- Finish/handoff is represented through `finish-bundle`; deeper branch automation remains deferred.
- Skill descriptions and `surfaceStatus` metadata are now part of workflow cleanup, not cosmetic polish.
