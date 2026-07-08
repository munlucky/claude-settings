# SPRINT CONTRACT

REQ-001 behaviorChanging: true
REQ-002 brownfield characterization
SCN-001 critical requiredDepth: e2e
UAT-CRITICAL-001 UAT-critical

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
  - id: REQ-002
    source: REQUIREMENTS_TRACEABILITY.md#REQ-002
    behaviorChanging: true
    verificationMode: characterization_first
    interface: code
    depth: integration
    environment: local
    characterizationCommand: node --test tests/legacy-pin.test.mjs
    evidencePath: .moonshot-relay/evidence/legacy-pin.json
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
    bypassReason: critical browser flow verified at scenario level
    status: pass
  - id: UAT-CRITICAL-001
    source: UAT_CHECKLIST.md#UAT-CRITICAL-001
    behaviorChanging: false
    verificationMode: evidence_mandatory
    interface: cli
    depth: integration
    environment: local
    requiredCommand: node scripts/spec-test-obligations.mjs validate --json
    evidencePath: .moonshot-relay/evidence/uat-critical.json
    bypassReason: UAT readiness is verified by closeout command
    status: pass
```
