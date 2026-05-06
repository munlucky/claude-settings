# Scenario Matrix

## Critical Scenarios

| Scenario ID | Flow | Evidence | Result |
|---|---|---|---|
| SCN-TFP-TRACE-ROOT | A trace sink attempts canonical trace writes while nested and external trace roots are rejected. | `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs` within the AWTL regression suite. | passed |
| SCN-TFP-TURN-RETRY | A phase attempt records same-turn lifecycle events, then a retry starts a different turn id. | `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs`. | passed |
| SCN-TFP-FAILED-CASE | A failure analyzer CLI run writes memory candidates and failed turn cases without raw payloads. | `node --test .claude/scripts/lib/awtl-failed-turn-case.test.mjs`. | passed |
| SCN-TFP-BRIEF | Prompt construction injects only matching failure prevention hints and stays raw JSON free. | `node --test .claude/scripts/lib/awtl-failure-prevention-brief.test.mjs`. | passed |
| SCN-TFP-SCORECARD-FILTER | Stale or risky replay scorecard entries are excluded from recall. | `node --test .claude/scripts/lib/awtl-replay-scorecard.test.mjs` and prevention brief scorecard test. | passed |
| SCN-TFP-PROMOTION-GATE | Promotion rejects imported-only, transcript-only, environment, flaky, invalid, and unavailable candidates unless verified or approved. | `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs`. | passed |
| SCN-TFP-CLOSEOUT | Phase runner policy, code policy, knowledge audit, runtime parity, and closeout evidence remain coherent after docs sync. | Phase 06 QA report and final workflow/closeout commands. | verified |
