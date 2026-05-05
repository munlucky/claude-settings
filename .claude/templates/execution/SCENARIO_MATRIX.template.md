# SCENARIO MATRIX

## Usage
- One row per user-visible scenario (`SCN-*`)
- Mark critical scenarios explicitly
- Prefer fresh browser or E2E evidence for critical rows
- Evidence rows may use the compact form `SCN-ID | pass | evidence path` in the Evidence column.

| Scenario ID | Requirement IDs | User Journey | Critical | Automation | Evidence | Notes |
|-------------|-----------------|--------------|----------|------------|----------|-------|
| SCN-001 | REQ-001 |  | yes / no | e2e / browser / manual | `SCN-001 \| pass \| .claude/logs/agent-loop/scn-001.log` |  |

## Rules
- Every critical `SCN-*` must have fresh runtime or E2E evidence before finish
- Manual-only critical scenarios are allowed for `uat_ready`, not for `uat_complete`
- If a scenario changes, rerun and refresh the evidence path
