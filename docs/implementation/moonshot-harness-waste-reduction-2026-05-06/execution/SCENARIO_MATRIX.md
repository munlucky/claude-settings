# SCENARIO MATRIX

## Usage
- One row per user-visible scenario (`SCN-*`)
- Mark critical scenarios explicitly
- Prefer fresh runtime evidence for critical rows
- Evidence rows may use the compact form `SCN-ID | pass | evidence path` in the Evidence column.

| Scenario ID | Requirement IDs | User Journey | Critical | Automation | Evidence | Notes |
|-------------|-----------------|--------------|----------|------------|----------|-------|
| SCN-P01-1 | MWR-001 | A bad plan path stops immediately instead of spending worker time | yes | manual | `SCN-P01-1 | pass | .claude/logs/agent-loop/debug.jsonl` | `path-authority-preflight-failed` logged and `worker-prompt-start` absent |
| SCN-P01-2 | MWR-002 | A valid phase-local master plan still closes out normally | yes | manual | `SCN-P01-2 | pass | .claude/verification-verdict-phase01-final.json` | closeout tests pass with explicit master plan distinction preserved |

## Rules
- Every critical `SCN-*` has fresh runtime evidence before finish
- Manual-only critical scenarios are allowed for `uat_ready`, not for `uat_complete`
- If a scenario changes, rerun and refresh the evidence path
