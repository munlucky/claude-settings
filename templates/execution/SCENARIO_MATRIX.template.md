# SCENARIO MATRIX

## Usage
- One row per user-visible scenario (`SCN-*`)
- Mark critical scenarios explicitly
- Prefer fresh browser or E2E evidence for critical rows
- Evidence rows may use the compact form `SCN-ID | pass | evidence path` in the Evidence column.
- For frontend/UI critical rows, record flow depth and required visual, accessibility, and performance evidence separately.

| Scenario ID | Requirement IDs | User Journey | Critical | Automation | Flow Depth | Evidence | Screenshot / Visual Evidence | A11y Evidence | Perf Evidence | Notes |
|-------------|-----------------|--------------|----------|------------|------------|----------|------------------------------|---------------|---------------|-------|
| SCN-001 | REQ-001 |  | yes / no | e2e / browser / manual | smoke / open-act-mutate-persist-recover | `SCN-001 \| pass \| .claude/logs/agent-loop/scn-001.log` | required/pass/fail/not_required + path | required/pass/fail/not_required + path | required/pass/fail/not_required + path |  |

## Rules
- Every critical `SCN-*` must have fresh runtime or E2E evidence before finish
- Manual-only critical scenarios are allowed for `uat_ready`, not for `uat_complete`
- If a scenario changes, rerun and refresh the evidence path
- Critical frontend `SCN-*` rows that require visual, accessibility, or performance evidence must show each required evidence type as `pass` with a current path before clean finish.
- Visual diff evidence should record `visual-diff: passed|failed|setup_gap` plus the verdict JSON path; diff image paths should be included when generated.
- Smoke-only evidence is a warning for critical rows and is blocking when the row or contract requires open -> act -> mutate -> persist -> recover evidence.
- Setup gaps should be recorded as `required/fail` for the affected evidence type only when that evidence is required. Missing visual baselines are setup gaps, not passes.
