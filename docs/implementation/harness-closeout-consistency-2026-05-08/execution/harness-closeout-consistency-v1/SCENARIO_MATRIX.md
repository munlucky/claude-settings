# Scenario Matrix

| ID | Requirement | Scenario | Evidence | Status |
|----|-------------|----------|----------|--------|
| SCN-01-1 | REQ-1.1 | Six harness defects are represented as synthetic regression fixtures with expected red baseline signals. | `node .claude/scripts/phase-closeout-reconciler.test.mjs`, `node .claude/scripts/verify-phase-closeout.test.mjs`, `.claude/verification-verdict-phase01-final.json` | verified |
| SCN-01-2 | REQ-1.1 | Future timestamp validation is pinned to an injected-clock expectation. | `node .claude/scripts/lib/clock.test.mjs`, `node .claude/scripts/verify-phase-closeout.test.mjs`, `.claude/verification-verdict-phase01-final.json` | verified |
| SCN-04-1 | REQ-1.5 | Completed phase state is rejected when workflow state remains failed without supersede metadata. | `node .claude/scripts/verify-phase-closeout.test.mjs` (`current-run`, `active-phase-run`, `latest-dispatch`, session `task_complete`, stale lease, future timestamp fixtures) | verified |
| SCN-04-2 | REQ-1.5 | Local fallback supersede metadata allows a previously failed delegated workflow state to close cleanly. | `node .claude/scripts/verify-phase-closeout.test.mjs`, `node .claude/scripts/phase-closeout-reconciler.test.mjs` | verified |
