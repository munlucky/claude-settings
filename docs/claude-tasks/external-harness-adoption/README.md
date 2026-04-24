# External Harness Adoption

Last-Reviewed: 2026-04-24

## Purpose

Prepare selective adoption of external harness and skill strategies without replacing the local Moonshot harness.

This package is not a bulk-install plan.
It is a review and pilot framework for deciding whether an external pattern should be adopted, adapted, rejected, or deferred.

## Current Position

The local harness already owns the runtime core:

- `moonshot-phase-runner`
- `verification.contract.yaml`
- `SPRINT_CONTRACT`
- `QA_REPORT`
- `SCORECARD`
- `HANDOFF`
- phase lease / loop guards

External projects should therefore reinforce weak procedures rather than replace execution control.

## Adoption Rules

- Do not install external skills directly into production `.claude/skills`.
- Run external skills or harnesses only in a sandbox/pilot location.
- Record every candidate as `adopt`, `adapt`, `reject`, or `defer`.
- Prefer local strategy transfer over vendoring full prompts.
- Treat hooks, shell commands, network access, or installer behavior as security-review triggers.
- Do not add a new public entrypoint without updating `skill-composition` and the skill architecture inventory.

## Wave 2 Focus

Wave 2 adapts these patterns locally:

- TDD-first execution discipline
- systematic debugging and blind-retry prevention
- worktree prepare / baseline evidence
- exact files / commands / expected signals in plans
- task-level `FULL / PARTIAL / NO` status vocabulary

## Files

- `pilot-registry.md`: candidate decisions and pilot status.
- `pilot-review-template.md`: checklist for reviewing a candidate before local adoption.

## Non-Goals

- No bulk `skills.sh` installation.
- No replacement of the phase runner.
- No default worktree auto-creation runtime.
- No external benchmark dependency in the day-to-day harness path.
