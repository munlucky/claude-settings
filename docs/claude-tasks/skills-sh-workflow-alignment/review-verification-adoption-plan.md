# Skills.sh Review / Verification Adoption Plan

Last-Reviewed: 2026-04-22

## Purpose

Reduce the `skills.sh` review and verification patterns into a concrete local adoption plan for `claude-settings`, with special focus on:

- review / verification session isolation
- review cadence
- evidence-before-completion
- remediation after review findings

This document is narrower than the March 2026 benchmark set. It only covers review and verification patterns that still add value after the current local workflow upgrades.

## Current Local State

The local repo is already strong on stage separation:

- `review-bundle` and `verification-bundle` are explicit in `.claude/config/workflow-bundles.yaml`
- `verification.contract.yaml` already sets `qa.evaluatorMode: "separate"`
- `completion-verifier`, `codex-review-code`, and `security-reviewer` already declare `context: fork`
- `verification-evidence-gate` already blocks completion claims without fresh evidence

But the implementation is still mixed rather than fully consistent:

- `browser-verifier` is in the verification bundle but does not declare `context: fork`
- `audit` and `web-design-guidelines` are in the review bundle but do not declare `context: fork`
- `codex-review-code` still says that Codex runtime may execute review in the current session
- `browser-verifier` also says Codex runtime executes directly in the current session
- `moonshot-teams-runner` describes Codex team mode as native coordination in the current session, which weakens the guarantee of isolated review/verification

Conclusion:

The repo already has `separate evaluator` as a policy, but does not yet guarantee `separate session` for every review and verification path.

## External Sources Reviewed

Reviewed on 2026-04-22:

- [requesting-code-review](https://skills.sh/obra/superpowers/requesting-code-review)
- [receiving-code-review](https://skills.sh/obra/superpowers/receiving-code-review)
- [verification-before-completion](https://skills.sh/obra/superpowers/verification-before-completion)
- [subagent-driven-development](https://skills.sh/jackspace/claudeskillz/subagent-driven-development)
- [dispatching-parallel-agents](https://skills.sh/obra/superpowers/dispatching-parallel-agents)
- [review](https://skills.sh/open-horizon-labs/skills/review)

## Selected Skills To Adapt

### `SSA-RV-001` `requesting-code-review`

- decision: `adopt`
- why:
  The strongest idea is not "have a reviewer", but "dispatch the reviewer with focused work-product context instead of session history".
- value to local repo:
  - reinforces fork-based review isolation
  - adds a concrete review request payload shape
  - makes review cadence explicit by task/batch/work size
- local targets:
  - `.claude/skills/codex-review-code/SKILL.md`
  - `.claude/skills/moonshot-orchestrator/SKILL.md`
  - `.claude/rules/workflow.md`
- adaptation:
  - require review payloads to prefer `SPRINT_CONTRACT.md`, changed file list, summary, and diff range over raw session memory
  - define mandatory review cadence for medium/complex work
  - treat review as required before moving to next meaningful batch, not only before final completion

### `SSA-RV-002` `receiving-code-review`

- decision: `adopt`
- why:
  The local repo already records review findings, but it is weak on the protocol for consuming review feedback rigorously without blind agreement or sloppy batch remediation.
- value to local repo:
  - improves fix-forward handling
  - clarifies when to push back on reviewer claims
  - reduces low-quality "implement everything reviewer said" behavior
- local targets:
  - `.claude/skills/codex-review-code/SKILL.md`
  - `.claude/skills/completion-verifier/SKILL.md`
  - `.claude/templates/execution/`
  - `QA_REPORT.md` conventions
- adaptation:
  - define remediation order: critical first, then simple, then complex
  - require clarification before implementing unclear multi-item review feedback
  - record accepted / challenged / deferred findings explicitly in `QA_REPORT.md`

### `SSA-RV-003` `verification-before-completion`

- decision: `adopt more explicitly`
- why:
  The local repo is already strong here, but the external skill states the rule in a much harder-to-misread way.
- value to local repo:
  - strengthens completion claim discipline
  - closes wording loopholes like "should pass", "looks good", or "likely fixed"
  - fits strict and standard profiles without architectural churn
- local targets:
  - `.claude/skills/completion-verifier/SKILL.md`
  - `.claude/skills/verification-evidence-gate/SKILL.md`
  - `.claude/rules/workflow.md`
  - `.claude/docs/guidelines/verification-contract.md`
- adaptation:
  - add an explicit "no positive completion claim without current-run evidence" rule
  - list forbidden claim patterns
  - require verification command provenance in the completion summary path

### `SSA-RV-004` `subagent-driven-development`

- decision: `adopt partially`
- why:
  The high-value part is not the whole workflow package. It is the rule that each bounded task gets a fresh subagent and review happens between tasks.
- value to local repo:
  - directly supports the desired patch direction of separate-session review/verification
  - sharpens medium/complex bounded work outside the phase harness
- local targets:
  - `.claude/skills/moonshot-orchestrator/SKILL.md`
  - `.claude/skills/moonshot-teams-runner/SKILL.md`
  - `.claude/skills/browser-verifier/SKILL.md`
  - review/verification skill frontmatter
- adaptation:
  - for read-only review and verification skills, prefer fork execution by default
  - for phase or bounded multi-task execution, review after each meaningful task/batch
  - keep the coordinator session summary-only between attempts

### `SSA-RV-005` `dispatching-parallel-agents`

- decision: `adopt selectively`
- why:
  This is useful when there are multiple independent failures, but it should not become the default for tightly coupled review or verification.
- value to local repo:
  - improves failure triage for unrelated verifier failures
  - fits existing `moonshot-teams-runner`
- local targets:
  - `.claude/skills/moonshot-teams-runner/SKILL.md`
  - `.claude/skills/moonshot-orchestrator/SKILL.md`
  - failure/retry guidance
- adaptation:
  - document independence criteria for parallel verification or review
  - use only when failing domains are disjoint in file scope or subsystem

## Skills Not Selected As Primary Workstreams

### `review` by open-horizon-labs

- decision: `defer`
- reason:
  The drift-detection idea is useful, but the skill is more of a general checkpoint framework than a stronger review/verification substrate than what already exists locally.

### `test-driven-development`

- decision: `defer to separate testing workstream`
- reason:
  Valuable, but broader than the current review/verification isolation problem.

## Next-Turn Patch Scope

The next patch should focus on the minimum load-bearing changes that improve review and verification isolation without rewriting the runtime adapters.

### Wave 1: Fork Consistency

Targets:

- `.claude/skills/browser-verifier/SKILL.md`
- `.claude/skills/audit/SKILL.md`
- `.claude/skills/web-design-guidelines/SKILL.md`
- `.claude/skills/plan-ceo-review/SKILL.md`
- `.claude/skills/plan-eng-review/SKILL.md`

Changes:

- add `context: fork` to read-only review or verification skills
- clarify that these skills should return structured summaries only
- align visibility notes so these skills are treated as isolated stage owners, not in-session commentary helpers

### Wave 2: Codex Path De-Biasing

Targets:

- `.claude/skills/codex-review-code/SKILL.md`
- `.claude/skills/browser-verifier/SKILL.md`
- `.claude/skills/moonshot-teams-runner/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`

Changes:

- remove or narrow "current Codex session" language for review/verification owners
- require fork-style execution semantics for read-only review and verification when runtime supports it
- keep main session as coordinator and merge back summary only
- make Codex path match the existing fork intent already documented elsewhere

### Wave 3: Review / Verification Contract Tightening

Targets:

- `.claude/rules/workflow.md`
- `.claude/docs/guidelines/verification-contract.md`
- `.claude/skills/completion-verifier/SKILL.md`
- `.claude/skills/verification-evidence-gate/SKILL.md`
- `.claude/skills/codex-review-code/SKILL.md`

Changes:

- promote "fresh evidence before any positive completion claim" into sharper workflow language
- add explicit forbidden claim examples
- add review request / remediation handling guidance from `requesting-code-review` and `receiving-code-review`

## Acceptance Criteria

The patch series should be considered successful when all of the following are true:

1. All read-only review and verification owners default to forked execution semantics.
2. Codex runtime docs no longer normalize current-session review as an equally valid default path for semantic review.
3. Review cadence is explicit for simple, medium, and complex work.
4. Completion claims require fresh evidence in a way that is hard to soften with wording tricks.
5. Review findings have a structured remediation protocol, not just a list of comments.

## Recommended Execution Order

1. Patch Wave 1 and Wave 2 together in the next turn.
2. Run doc/policy verification after the metadata changes.
3. Patch Wave 3 only after the fork semantics are consistent enough that the policy language is actually true.

## Summary

The best imports from `skills.sh` are not whole foreign workflows.

They are a small set of stricter operating rules:

- reviewer gets work-product context, not session history
- review happens between meaningful tasks, not only at the end
- feedback is evaluated before remediation, not blindly obeyed
- no positive completion claim happens without fresh verification evidence
- review and verification should run in separate sessions whenever they are read-only evaluators
