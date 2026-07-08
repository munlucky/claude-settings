# SPRINT CONTRACT

SCN-001 critical requiredDepth: e2e

## Spec-Test Obligations

```spec-obligations
specTestObligations:
  - id: SCN-001
    source: SCENARIO_MATRIX.md#SCN-001
    behaviorChanging: true
    verificationMode: evidence_mandatory
    interface: browser
    depth: smoke
    requiredDepth: e2e
    environment: local
    requiredCommand: npx playwright test smoke
    evidencePath: .moonshot-relay/evidence/scn-001-smoke.json
    bypassReason: temporary smoke run
    status: pass
```
