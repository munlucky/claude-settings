# Phase 04: Review Range CRG and Diff Hygiene

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "verification-sidecar"
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - ".codex/agents/verification/code_review_graph_evidence.py"
    - ".codex/agents/verification/code_review_graph_evidence_test.py"
  readOnlyPaths:
    - ".claude/scripts/lib/code-review-graph-fixtures"
    - ".claude/scripts/lib/code-review-graph-evidence.mjs"
  sharedMutablePaths:
    - "docs/implementation/phase-runner-state-board-closeout-remediation-2026-05-14/planning-loop/phase-04-cli-evidence.md"
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Source Mapping

- REQ-3: Python CRG evidence test points to `.codex/scripts/lib/code-review-graph-fixtures`.
- REQ-4: Range diff hygiene fails on blank EOF line in `.codex/agents/verification/code_review_graph_evidence.py`.
- REQ-6: Native `code-review-graph` MCP is unavailable in this session; CLI fallback evidence is required.
- AC-6, AC-7, AC-8.

## Goal

Make review-range verification pass without relying on stale native MCP transport.

AC-8 scope is CLI evidence only. Phase 04 must not implement MCP unavailable-cache behavior or claim that stale MCP calls are suppressed across a run.

## Scope

Modify only `.codex/agents/verification` Python files if needed.

Out of scope:

- Editing `.claude/scripts/lib/code-review-graph-fixtures`.
- Re-registering MCP servers.
- Restarting Codex Desktop as part of implementation.
- Implementing unavailable-cache or no-repeat-MCP behavior.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Fix fixture root resolution to locate `.claude/scripts/lib/code-review-graph-fixtures` from the repo root. | `.codex/agents/verification/code_review_graph_evidence_test.py` | Python test no longer raises `FileNotFoundError`. |
| T2 | Remove the range diff hygiene failure in `code_review_graph_evidence.py`. | `.codex/agents/verification/code_review_graph_evidence.py` | `git diff --check f56a4f7..HEAD` passes. |
| T3 | Record CRG CLI fallback evidence instead of native MCP evidence. | Runner QA output or `planning-loop/phase-04-cli-evidence.md` | `code-review-graph detect-changes --repo . --base f56a4f7... --brief` passes. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-07 | Python CRG evidence tests can read shared fixtures. | `python .codex/agents/verification/code_review_graph_evidence_test.py` | All tests pass. | Phase QA report |
| SCN-08 | Range hygiene is clean. | `git diff --check f56a4f7fc12476fec685af87a6122ddd7449e874..HEAD` | No output, exit code 0. | Phase QA report |
| SCN-09 | CRG review fallback is available through CLI evidence. | `code-review-graph detect-changes --repo . --base f56a4f7fc12476fec685af87a6122ddd7449e874 --brief` | Command exits 0 and the output is captured by runner QA output or `planning-loop/phase-04-cli-evidence.md`. | Runner QA output or plan-package evidence file |

## Validation Plan

```powershell
python .codex/agents/verification/code_review_graph_evidence_test.py
git diff --check
git diff --check f56a4f7fc12476fec685af87a6122ddd7449e874..HEAD
code-review-graph detect-changes --repo . --base f56a4f7fc12476fec685af87a6122ddd7449e874 --brief
```

Blocker condition: if range diff hygiene failure belongs to an immutable historical commit and cannot be fixed without rewriting history, stop and document whether the acceptance target should move from range diff to worktree diff.

## Deliverables

- Passing Python CRG evidence test.
- Passing range diff hygiene.
- CLI CRG fallback evidence captured by runner QA output or `planning-loop/phase-04-cli-evidence.md`.

## Phase Completion Checklist

- [ ] Fixture path resolves shared fixtures from `.claude`.
- [ ] EOF blank line range hygiene is fixed.
- [ ] CLI CRG evidence is recorded.
