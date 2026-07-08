# SPRINT CONTRACT

REQ-REAL is in scope.

```text
REQ-EXAMPLE must be ignored because it is an ordinary fenced example.
```

```spec-obligations
SCN-FENCED
specTestObligations:
  - id: REQ-REAL
    source: REQUIREMENTS_TRACEABILITY.md#REQ-REAL
    behaviorChanging: true
    verificationMode: tdd_red_green
    interface: code
    depth: unit
    environment: hermetic
    redCommand: node --test tests/real.test.mjs
    redEvidencePath: .moonshot-relay/evidence/real-red.json
    greenCommand: node --test tests/real.test.mjs
    greenEvidencePath: .moonshot-relay/evidence/real-green.json
    status: pass
  - id: SCN-FENCED
    source: SCENARIO_MATRIX.md#SCN-FENCED
    behaviorChanging: true
    verificationMode: evidence_mandatory
    interface: browser
    depth: e2e
    environment: local
    requiredCommand: npx playwright test scn-fenced
    evidencePath: .moonshot-relay/evidence/scn-fenced.json
    bypassReason: browser flow verified at scenario level
    status: pass
```
