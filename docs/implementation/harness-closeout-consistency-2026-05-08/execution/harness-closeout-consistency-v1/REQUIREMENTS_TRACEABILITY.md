# Requirements Traceability

| ID | Requirement | Evidence | Status |
|----|-------------|----------|--------|
| REQ-1.1 | Synthetic fixtures capture the six closeout consistency defects without historical session files. | `.claude/scripts/phase-closeout-reconciler.test.mjs`, `.claude/scripts/verify-phase-closeout.test.mjs`, `.claude/scripts/lib/clock.test.mjs`, `.claude/verification-verdict-phase01-final.json` | verified |
| REQ-1.5 | phase-status/workflow/session contradiction과 stale lease를 hard-fail한다. | `.claude/scripts/verify-phase-closeout.mjs`, `.claude/scripts/verify-phase-closeout.test.mjs`, `node .claude/scripts/verify-phase-closeout.test.mjs` | verified |
