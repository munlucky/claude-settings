# Phase Runner State Board Runtime Contract Fixes QA Report

## Harness Change Ledger
| Change Area | Paths | Evidence | Risk |
|-------------|-------|----------|------|
| Terminal blocked board publish wiring | `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/agent-loop-phase-runner.test.mjs`, `.claude/scripts/lib/terminal-blocker-publisher.mjs`, `.claude/scripts/lib/terminal-blocker-publisher.test.mjs` | Phase 01 QA report and verification verdict | Terminal blocker must publish committed board state before retry can spawn. |
| Reconciliation evidence path unification | `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/agent-loop-phase-runner.test.mjs`, `.claude/scripts/lib/simple-run-state.test.mjs`, `.claude/scripts/lib/terminal-blocker-publisher.mjs`, `.claude/scripts/lib/terminal-blocker-publisher.test.mjs` | Phase 02 QA report and verification verdict | Same-attempt resume must require runRoot evidence and matching intent. |
| Active transition semantics | `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/agent-loop-phase-runner.test.mjs`, `.claude/scripts/agent-loop.mjs`, `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/moonshot-phase-dispatch.test.mjs` | Phase 03 QA report, runtime parity, and dispatch tests | Active start and dry-run dispatch must not create false pending/resume blockers. |
