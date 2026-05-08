# Meta-Harness Trace Format

## Purpose

Define a compact trace bundle for harness attempts so later diagnosis does not depend on re-reading raw logs by hand.

## Output Layout

Each captured trace lives under:

` .claude/logs/meta-harness-trace/<trace-id>/ `

Required files:
- `manifest.json`: canonical machine-readable attempt summary
- `diagnosis.json`: structured diagnosis view for agents and scripts
- `diagnosis.md`: human-readable trimmed view

## Manifest Requirements

`manifest.json` should record:
- phase identity and status
- stop/closeout fields from `QA_REPORT.md` and `HANDOFF.md`
- verifier verdict path, verdict, freshness, and score
- evidence-include policy decisions and any partial-mode blocker note
- workflow readiness/completion state from `current-run.json`
- selected/applied/skipped skills and stage order
- raw source artifact paths with size and mtime
- artifact delta summary sufficient to compare attempts later

## Diagnosis View Rules

`diagnosis.md` and `diagnosis.json` should preserve:
- stop reason
- verifier verdict
- score verdict
- blocker codes
- review / finish closeout state
- ignored verification evidence that still matters for auditability
- workflow bundle and skill evidence

They should trim:
- repeated success-only lines
- duplicated headings
- non-salient noise that does not change failure interpretation

## Source Priority

Prefer these inputs in order:
1. phase execution artifacts (`QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md`)
2. workflow state (`current-run.json`, `latest-bounded.json`, `latest-dispatch.json`)
3. verifier artifact (`.claude/verification-verdict-*.json`)
4. loop logs (`.claude/logs/agent-loop/*`)

Execution artifacts are the closeout truth source because they carry the phase's explicit stop boundary, review state, score, and verifier path. Workflow state is supporting evidence for active leases, dispatcher status, and fallback transitions. Verifier artifacts prove the most recent machine verdict, but they do not override a newer artifact-level closeout decision. Loop logs are retained for audit and diagnosis, not as the primary completion authority.

When a delegated-terminal attempt fails but a local fallback attempt completes the same phase, the trace must keep both events visible. The fallback completion should be represented as `completed-via-local-fallback`, and the earlier delegated failure should be marked or interpreted as `superseded-by-local-fallback`. Superseding means the older failure is no longer the active closeout verdict; it does not erase the failure from the audit trail.

## Validation

A usable trace bundle must make it possible to answer all of these without reopening raw logs:
- What phase and stop boundary produced this trace?
- Did verification pass with fresh evidence?
- What bundles, skills, and stages were active?
- What blockers or warnings prevented clean finish?
- Which raw artifacts remain available for deeper inspection?
- Were any verification artifacts intentionally retained even though they were not counted as pass/fail evidence?
