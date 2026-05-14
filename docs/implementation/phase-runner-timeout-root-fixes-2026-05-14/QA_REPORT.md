# Plan QA Report

## Harness Change Ledger

| Change Area | Phases | Files | Reason | Verification |
|-------------|--------|-------|--------|--------------|
| Diagnostic search budget | Phase 01 | `.claude/scripts/check-mcp.sh`, `.claude/scripts/phase-capability-preflight.mjs`, `.claude/scripts/lib/failure-classifier.mjs`, `.claude/scripts/agent-loop-phase-plan-lib.mjs` | Prevent broad npm cache scans from repeating after timeout. | `.claude/verification-verdict-phase01-final.json` |
| Diff output budget | Phase 02 | `.claude/scripts/agent-loop-phase-plan-lib.mjs`, `.claude/scripts/token-safe-git.sh`, `.claude/scripts/agent-loop-phase-runtime.mjs` | Prevent unbounded raw `git diff` output from dominating worker logs and timeout retries. | `.claude/verification-verdict-phase02-final.json` |
