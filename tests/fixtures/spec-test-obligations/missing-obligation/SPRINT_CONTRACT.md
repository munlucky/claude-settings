# SPRINT CONTRACT

## In-Scope Traceability
- REQ-001
- REQ-002
- SCN-001 critical requiredDepth: e2e

## Spec-Test Obligations

```spec-obligations
specTestObligations:
  - id: REQ-001
    source: REQUIREMENTS_TRACEABILITY.md#REQ-001
    behaviorChanging: true
    verificationMode: tdd_red_green
    interface: code
    depth: unit
    environment: hermetic
    redCommand: node --test tests/req-001.test.mjs
    redEvidencePath: .moonshot-relay/evidence/req-001-red.json
    greenCommand: node --test tests/req-001.test.mjs
    greenEvidencePath: .moonshot-relay/evidence/req-001-green.json
    status: pass
  - id: SCN-001
    source: SCENARIO_MATRIX.md#SCN-001
    behaviorChanging: true
    verificationMode: evidence_mandatory
    interface: browser
    depth: e2e
    environment: local
    requiredCommand: npx playwright test scn-001
    evidencePath: .moonshot-relay/evidence/scn-001.json
    bypassReason: critical browser flow requires integrated evidence
    status: pass
```
