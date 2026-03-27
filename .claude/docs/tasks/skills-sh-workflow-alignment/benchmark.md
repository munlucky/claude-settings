# Skills.sh Workflow Alignment Benchmark

Last-Reviewed: 2026-03-27

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

- A single stage-oriented workflow map is still missing from the public docs.
- Isolation is guarded but under-explained.
- Review cadence is distributed across multiple skills and guides.
- Finish/handoff is utility-driven rather than stage-driven.
- Skill descriptions should be tightened to be more trigger-oriented and search-friendly.
