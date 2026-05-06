# Requirements Traceability

## Coverage

| Req ID | Requirement | Implementation Evidence | Verification Evidence | Status |
|---|---|---|---|---|
| REQ-TFP-001 | Failed turns become reusable local prevention hints without raw trace promotion. | Phase 03 failed turn case builder and Phase 04 failure prevention brief. | `awtl-failed-turn-case.test.mjs`, `awtl-failure-prevention-brief.test.mjs` passed. | verified |
| REQ-TFP-002 | Trace artifacts cannot leak through nested `.claude/.claude/traces` or tracked trace paths. | Phase 01 trace sink guard, `.gitignore`, and code policy update. | `awtl-trace-sink.test.mjs` and `verify-code-policy.sh` passed. | verified |
| REQ-TFP-003 | Runner capture propagates stable `turn_id` across same-turn events and creates a new id per retry attempt. | Phase 02 capture and runner changes. | `awtl-harness-capture.test.mjs` passed. | verified |
| REQ-TFP-004 | Failed judge results produce compact failed turn cases with `failure_turn_id`. | Phase 03 schema, builder, analyzer CLI output. | `awtl-failed-turn-case.test.mjs` passed. | verified |
| REQ-TFP-005 | Next-run prompts can receive bounded matching prevention briefs. | Phase 04 prompt build integration and matcher. | `awtl-failure-prevention-brief.test.mjs` passed. | verified |
| REQ-TFP-006 | MemoryGraph promotion is verified-only or explicitly approved. | Phase 05 promotion flow, denial codes, direct write option. | `awtl-memory-promotion.test.mjs` passed. | verified |
| REQ-TFP-007 | Replay scorecard blocks stale or risky prevention hints. | Phase 05 replay scorecard and Phase 04 recall filter integration. | `awtl-replay-scorecard.test.mjs` and prevention brief scorecard tests passed. | verified |
| REQ-TFP-008 | Raw traces, prompt bodies, and transcript-only/imported-only candidates never become compact MemoryGraph facts. | AWTL privacy/provenance docs and promotion gate. | `awtl-failure-attribution.test.mjs`, `awtl-memory-promotion.test.mjs`, and importer tests passed. | verified |
| REQ-TFP-009 | MemoryGraph unavailable is a promotion write skip/failure, not unrelated workflow closeout failure. | MemoryGraph workflow contract and promotion output semantics. | `memorygraph-direct.mjs health` passed in this run; unavailable branch covered by `awtl-memory-promotion.test.mjs`. | verified |
| REQ-TFP-010 | Regression contract covers trace, turn, failed case, recall, promotion, and closeout. | Phase 06 verification contract and closeout artifact sync. | Phase 06 regression command set recorded in QA report. | verified |
