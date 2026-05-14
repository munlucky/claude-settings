# Phase 01: Diagnostic Search Budget

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "timeout-root-fixes"
  dependsOn: []
  conflictsWith:
    - "03-runtime-parity-routing-v1.md"
    - "04-timeout-ledger-policy-v1.md"
  ownedPaths:
    - ".claude/scripts/check-mcp.sh"
    - ".claude/scripts/check-mcp.test.mjs"
    - ".claude/scripts/phase-capability-preflight.mjs"
    - ".claude/scripts/phase-capability-preflight.test.mjs"
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

Make CRG/MCP diagnosis deterministic and bounded. Default diagnosis must not recursively scan global npm/npx caches.

## Scope

- Patch MCP/CRG capability diagnosis only.
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

Broad search debug mode must apply path, file count, and timeout limits.

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add fixture proving default CRG check does not scan npm cache paths. | `check-mcp.test.mjs` | Fails before patch, passes after patch. |
| T2 | Bound fallback diagnostics and same-run unavailable caching. | `check-mcp.sh`, `runtime-unavailable-cache.mjs` | Missing CRG exits with warning and evidence in <= 15s. |
| T3 | Add preflight test for broad-search timeout classification. | `phase-capability-preflight.test.mjs` | Class is `broad_search_timeout`. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-01 | Missing CRG command does not scan npm cache by default. | `node --test .claude/scripts/check-mcp.test.mjs` | No `_npx` recursive search appears in command trace. | QA_REPORT.md |
| SCN-02 | Broad cache scan requires debug opt-in. | focused preflight test | Default path skips broad search; debug path is bounded. | QA_REPORT.md |

## Validation Plan

```powershell
node --test .claude/scripts/check-mcp.test.mjs
node --test .claude/scripts/phase-capability-preflight.test.mjs
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
