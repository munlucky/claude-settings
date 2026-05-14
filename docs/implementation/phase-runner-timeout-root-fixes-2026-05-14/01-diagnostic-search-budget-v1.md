# Phase 01: Diagnostic Search Budget

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "timeout-root-fixes"
  dependsOn: []
  conflictsWith:
    - "02-diff-output-budget-v1.md"
    - "03-runtime-parity-routing-v1.md"
    - "04-timeout-ledger-policy-v1.md"
  ownedPaths:
    - ".claude/scripts/check-mcp.sh"
    - ".claude/scripts/check-mcp.test.mjs"
    - ".claude/scripts/phase-capability-preflight.mjs"
    - ".claude/scripts/phase-capability-preflight.test.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/lib/runtime-unavailable-cache.mjs"
  readOnlyPaths:
    - ".claude/logs/code-review-graph"
    - ".codex/config.toml"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- OBS-1: broad `rg` over npm/npx cache timed out during CRG/MCP diagnosis.
- REQ-1, AC-1.

## Goal

Make CRG/MCP diagnosis deterministic and bounded. Default harness and agent diagnostic behavior must not recursively scan global npm/npx caches.

## Scope

- Patch MCP/CRG capability diagnosis in `check-mcp.sh` and capability preflight.
- Add runner/agent diagnostic search budget instructions so ad-hoc investigation prompts cannot ask workers to recursively scan npm/npx caches by default.
- Add a same-run unavailable cache or reuse the existing one where appropriate.
- Keep broad cache scan available only through explicit debug opt-in.

## Non-Goals

- Do not change actual code-review-graph graph semantics.
- Do not make CRG strict in normal phase closeout.
- Do not scan user-wide caches by default.

## Required Behavior

Default diagnostic order:

1. Check configured command or known wrapper path.
2. Check `command -v`, `where`, or platform equivalent.
3. Run bounded `--version` / `status --repo .` checks with short timeout.
4. Record diagnostic and fallback evidence.
5. Skip global cache scan unless `CRG_DEBUG_BROAD_SEARCH=true`.

Broad search debug mode limits:

| Limit | Required Value |
| --- | --- |
| Opt-in env | `CRG_DEBUG_BROAD_SEARCH=true` |
| Allowed roots | Active project root and the resolved CRG/MCP package root only. User-wide `C:\Users\*\AppData\Local\npm-cache\_npx` is not an allowed root unless it is the resolved package root. |
| Maximum files inspected | 200 files total |
| Maximum wall time | 10 seconds |
| Maximum output | 80 lines |
| Required fallback after cap hit | Write `broad_search_timeout`, record the skipped root, and do not retry broad search in the same run. |

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add fixture proving default CRG check does not scan npm cache paths. | `check-mcp.test.mjs` | Fails before patch, passes after patch. |
| T2 | Bound fallback diagnostics and same-run unavailable caching. | `check-mcp.sh`, `runtime-unavailable-cache.mjs` | Missing CRG exits with warning and evidence in <= 15s. |
| T3 | Add preflight test for broad-search timeout classification. | `phase-capability-preflight.test.mjs` | Class is `broad_search_timeout`. |
| T4 | Add runner/agent diagnostic budget prompt fixture for OBS-1. | `agent-loop-phase-runner.test.mjs` | Worker instructions forbid recursive npm/npx cache search unless debug env and caps are present. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-01 | Missing CRG command does not scan npm cache by default. | `node --test .claude/scripts/check-mcp.test.mjs --test-name-pattern "default diagnosis skips npm cache"` | No `_npx` recursive search appears in command trace. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-01-qa.md` |
| SCN-02 | Broad cache scan requires debug opt-in and hard caps. | `node --test .claude/scripts/phase-capability-preflight.test.mjs --test-name-pattern "broad search debug caps"` | Default path skips broad search; debug path enforces project/package roots, 200 files, 10 seconds, and 80 output lines. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-01-qa.md` |
| SCN-02A | OBS-1 no-regression: agent diagnostic instruction changes behavior. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "diagnostic search budget"` | Generated worker guidance proposes known-path/version checks before any broad search and includes the debug caps. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-01-qa.md` |

## Validation Plan

```powershell
node --test .claude/scripts/check-mcp.test.mjs
node --test .claude/scripts/phase-capability-preflight.test.mjs
node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "diagnostic search budget"
git diff --check
```

## Blocker Condition

Stop if a required CRG diagnostic still needs recursive user cache scanning in normal mode. Route that case to explicit debug instructions instead of automatic runner behavior.

## Deliverables

- Bounded MCP/CRG diagnosis.
- Durable diagnostic/fallback evidence.
- No default recursive npm/npx cache scan.

## Phase Completion Checklist

- [ ] Default diagnosis avoids global cache recursion.
- [ ] Missing dependency diagnosis finishes within the configured short budget.
- [ ] `broad_search_timeout` is classified and not retried in the same run.
