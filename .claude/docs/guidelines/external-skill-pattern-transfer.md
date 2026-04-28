# External Skill Pattern Transfer

Last-Reviewed: 2026-04-28

## Purpose

Adopt useful external skill strategies without increasing the public skill surface or replacing the local Moonshot harness.

This guideline is based on review of Matt Pocock's `mattpocock/skills` repository and the local external harness adoption package.

## Adoption Principle

Prefer pattern transfer over skill import.

External skills should become one of:

- an update to an existing stage owner
- a reference checklist under `.claude/docs/guidelines/`
- a template or script used by an existing skill
- a deferred pilot entry in `docs/claude-tasks/external-harness-adoption/`

Do not add a new public skill unless it has a distinct trigger, distinct output contract, and changes orchestration decisions.

## Surface Budget

Public entrypoints stay stable:

- `product-orchestrator`
- `moonshot-orchestrator`
- `moonshot-phase-runner`

New standalone skills are allowed only when all are true:

- users can invoke it directly with predictable intent
- an existing skill would mix unrelated responsibilities if expanded
- the skill has clear inputs, outputs, and blocking conditions
- it can be tested or audited independently
- the skill is added to skill architecture inventory and composition docs

## Pattern Mapping

| External pattern | Local destination | Transfer mode |
|---|---|---|
| `design-an-interface` | `plan-eng-review`, `test-driven-development`, architecture reviews | require multiple interface shapes before risky module design |
| `domain-model` | `product-orchestrator`, `project-md-refresh`, `plan-eng-review` | challenge plans against project terminology and ADRs |
| `ubiquitous-language` | `docs/glossary/README.md`, `.claude/PROJECT.md` | record canonical terms and aliases to avoid |
| `improve-codebase-architecture` | `plan-eng-review`, `code-simplifier`, `codex-review-code` | use deep-module, deletion-test, and locality/leverage checks |
| `tdd` | `test-driven-development` | enforce one RED-GREEN tracer bullet at a time |
| `to-issues` | `task-slicer`, optional GitHub export | split work into AFK/HITL vertical slices |
| `qa` / `triage-issue` | `qa-flow`, `failure-analyzer`, GitHub connector workflow | file durable behavior-focused issues with repro and TDD fix plans |
| `github-triage` | future optional GitHub workflow | label state machine remains optional, not default runtime |
| `request-refactor-plan` | `task-slicer`, `plan-eng-review` | require tiny working refactor steps and testing decisions |
| `write-a-skill` | skill authoring policy | keep `SKILL.md` concise; move advanced material to references |
| `zoom-out` | explorer/review prompts | ask for module/caller map before local edits in unfamiliar areas |
| `caveman` | communication preference only | do not install as default policy |
| `git-guardrails-claude-code` | security/workspace policy | borrow blocked-operation list only after hook review |
| `Claude.md workflow orchestration prompt` | `moonshot-orchestrator`, `failure-analyzer`, `session-logger`, `code-simplifier` | transfer correction learning, sideways replan, balanced elegance, and autonomous bug-fix posture into existing stage owners |

## Interface-First Review

For module design, API design, or refactor planning, reviewers should ask for at least two materially different interface shapes when the first design affects many callers or long-lived contracts.

Compare designs by:

- interface simplicity
- ease of correct use
- ease of misuse
- depth: small interface hiding meaningful behavior
- locality: whether bugs and changes concentrate in one place
- implementation efficiency

Do not implement during interface exploration unless execution has already been approved.

## Domain Language Discipline

Plans and issues should use project domain language, not transient implementation names.

When a term is ambiguous:

- compare it against `docs/glossary/README.md` and `.claude/PROJECT.md`
- choose a canonical term
- record aliases to avoid
- create or update an ADR only for hard-to-reverse, surprising, trade-off decisions

## Deep Module Review

Architecture review should look for deepening opportunities:

- pass-through modules that fail the deletion test
- interfaces nearly as complex as their implementation
- extracted helpers that improve testability but lose locality
- seams with only one adapter that may be hypothetical
- tightly coupled modules leaking responsibilities across boundaries

Use this vocabulary consistently:

- module
- interface
- implementation
- depth
- adapter
- leverage
- locality

## TDD Tracer Bullet Rule

Behavior-changing work should avoid horizontal test/code batches.

Required loop:

```text
RED: one behavior test through a public interface
GREEN: minimal implementation for that one test
REPEAT: next behavior
REFACTOR: only after green
```

Tests should verify observable behavior and survive internal refactors.

## Issue and QA Transfer

When exporting work to GitHub issues, prefer durable behavior descriptions:

- no file paths or line numbers in issue bodies unless explicitly requested
- user-visible expected vs actual behavior
- concrete reproduction steps
- AFK/HITL classification
- dependency order
- TDD fix plan for bugs
- acceptance criteria that can be verified independently

## Skill Quality Transfer

`SKILL.md` should stay concise. If a skill grows beyond a readable trigger-and-workflow surface, move details to:

- `.claude/docs/guidelines/`
- skill-local `assets/`
- templates
- deterministic scripts

Long skills are acceptable only when they are public control planes whose rules must remain visible to the runtime.

## Workflow Prompt Transfer

When reviewing a compact system prompt or `Claude.md` workflow prompt, split patterns into accepted, already-covered, and rejected groups before editing the harness.

Accept these patterns when missing:

- **Sideways replan**: if implementation, review, or verification shows the plan is invalid, stop the current tactic and re-enter planning or sequence decision with evidence.
- **Correction learning**: after a user correction or repeated agent mistake, classify the pattern through `failure-analyzer`; use `session-logger` only when the run already needs session/handoff logging or the lesson qualifies for `.claude/docs/solutions/` promotion.
- **Balanced elegance**: for non-trivial changes, run a simplification/elegance pass after behavior works; skip and record the reason for simple obvious fixes.
- **Autonomous bug fixing**: for bug reports with enough evidence, inspect logs/tests/errors and fix forward before asking for more context.

Usually already covered locally:

- plan-before-build discipline
- fresh verification before completion
- bounded subagent/fork context isolation
- minimal-scope changes

Reject or soften these patterns:

- "use subagents liberally" without context-budget or fork-return limits
- mandatory plan docs for trivial one-step fixes
- writing durable lessons for every minor correction
- generic "senior engineer" self-approval without executable evidence
