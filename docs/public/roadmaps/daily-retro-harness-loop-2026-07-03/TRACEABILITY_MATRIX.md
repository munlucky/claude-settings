# Traceability Matrix

| Requirement ID | ASR IDs | QAS IDs | ADR IDs | Spec Delta ID | Task ID | Owner | Evidence Path | Verification Signal | Status |
|---|---|---|---|---|---|---|---|---|---|
| RETRO-REQ-001 | ASR-001, ASR-003 | QAS-001 | ADR-0002, ADR-0003 | DELTA-001 | PHASE-01 | retro-contracts | `schemas/retro.collect.schema.json` | `node --test tests/retro-collect-contract.test.mjs` | accepted |
| RETRO-REQ-002 | ASR-002 | QAS-005 | ADR-0003 | DELTA-002 | PHASE-01, PHASE-02 | retro-store | `docs/public/repository-layout.md`, `tools/retro/retro-store.mjs` | package exclusion tests; store path tests | accepted |
| RETRO-REQ-003 | ASR-003 | QAS-001 | ADR-0002 | DELTA-003 | PHASE-02 | retro-normalize | `tools/harness-lab/harness-history.mjs`, `tools/retro/retro-normalize.mjs` | `node --test tests/retro-redaction-contract.test.mjs` | accepted |
| RETRO-REQ-004 | ASR-002, ASR-003 | QAS-001 | ADR-0003 | DELTA-004 | PHASE-02 | retro-collect-import | `tools/retro/retro-cli.mjs`, `tools/retro/collect.mjs`, `tools/retro/daily-retro.mjs` | collect and import fixture CLI tests | accepted |
| RETRO-REQ-005 | ASR-004, ASR-006 | QAS-002, QAS-003 | ADR-0005 | DELTA-005 | PHASE-03 | retro-daily | `tools/retro/daily-retro.mjs`, `templates/retro/DAILY_RETRO.md` | `node --test tests/daily-retro-contract.test.mjs` | accepted |
| RETRO-REQ-006 | ASR-004, ASR-006 | QAS-002, QAS-003 | ADR-0005 | DELTA-006 | PHASE-03 | retro-patterns | `tools/retro/retro-patterns.mjs` | repeated vs isolated failure fixture tests | accepted |
| RETRO-REQ-007 | ASR-004, ASR-007 | QAS-003 | ADR-0004, ADR-0005 | DELTA-007 | PHASE-04 | retro-proposer | `tools/retro/improvement-proposer.mjs`, `schemas/improvement-candidate-v1.schema.json` | `node --test tests/retro-improvement-proposer-contract.test.mjs` | accepted |
| RETRO-REQ-008 | ASR-007 | QAS-004 | ADR-0004 | DELTA-008 | PHASE-04 | issue-draft | `tools/retro/issue-draft-writer.mjs`, `templates/retro/GITHUB_ISSUE_DRAFT.md` | `node --test tests/retro-issue-draft-contract.test.mjs` | accepted |
| RETRO-REQ-009 | ASR-005 | QAS-004 | ADR-0001 | DELTA-009 | PHASE-05 | public-cli | `bin/moonshot-relay.mjs` | `node bin/moonshot-relay.mjs retro --help` | accepted |
| RETRO-REQ-010 | ASR-002, ASR-005 | QAS-005 | ADR-0001 | DELTA-010 | PHASE-05 | docs-skill | `docs/public/guidelines/daily-retro-workflow.md`, `skills/moonshot-retro/SKILL.md` | skill surface and docs tests | accepted |
| RETRO-REQ-011 | ASR-001 | QAS-001, QAS-004 | ADR-0002 | DELTA-011 | PHASE-01 through PHASE-05 | all-output-writers | all retro schemas and output writers | `node --test tests/retro-no-promotion-authority-contract.test.mjs` | accepted |
| RETRO-REQ-012 | all | all | all | DELTA-012 | PHASE-05 | regression-suite | `package.json`, `tests/retro-*.test.mjs` | `npm run test:retro`; `npm test` | accepted |
| RETRO-DEF-001 | ASR-007 | QAS-004 | ADR-0004 | DELTA-008 | later | none | issue draft only | no GitHub write path in initial tests | deferred |
| RETRO-DEF-002 | ASR-008 | QAS-005 | ADR-0001 | DELTA-003 | later | none | `tools/harness-lab/harness-history.mjs` | existing history tests stay unchanged | deferred |
| RETRO-REJ-001 | ASR-001 | QAS-001 | ADR-0002 | none | none | none | none | schema forbids `promotionAuthority: true` | rejected |
| RETRO-REJ-002 | ASR-002 | QAS-005 | ADR-0003 | none | none | none | none | package exclusion tests | rejected |
