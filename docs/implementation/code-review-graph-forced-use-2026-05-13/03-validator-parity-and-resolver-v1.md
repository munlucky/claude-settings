# Phase 03 - Validator Parity and Resolver

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "sequential"
  dependsOn: ["02-cli-adapter-and-graph-state-v1.md"]
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/code-review-graph-evidence.mjs"
    - ".claude/scripts/lib/code-review-graph-evidence.test.mjs"
    - ".claude/scripts/lib/code-review-graph-fixtures/"
    - ".claude/agents/verification/code_review_graph_evidence.py"
    - ".claude/agents/verification/code_review_graph_evidence_test.py"
  readOnlyPaths:
    - ".claude/agents/verification/verify-changes.sh"
    - ".claude/agents/verification/build-verdict-json.py"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_validator"
```

## Goal
Make Node and Python gates return the same CRG decision for the same fixture.

## Validator Input
```json
{
  "validationProfile": "strict",
  "evidenceCarrier": "phase",
  "changedFiles": {
    "files": [],
    "source": "verdict_json",
    "baseRef": "<resolved-ref>",
    "baseRefSource": "upstream_merge_base",
    "baseRefWarning": null,
    "fallbackUsed": false
  },
  "selectedHarnessComponents": [],
  "skippedHarnessComponents": [],
  "codeReviewGraph": {}
}
```

## Validator Output
```json
{
  "status": "pass",
  "blocking": false,
  "profileAction": "pass",
  "retryable": false,
  "warningCode": null,
  "blockerCode": null,
  "blockerClass": null,
  "reason": "ok",
  "missingStages": [],
  "invalidSkipReason": null,
  "baseRefWarning": null,
  "normalizedEvidence": {}
}
```

## Artifact Path Validation
- Resolve `evidenceArtifactPath` with `realpath`.
- Reject paths outside the mode-specific allowed root:
  - phase root: `<phase-execution-dir>/evidence/code-review-graph/`
  - bounded root: `.claude/logs/code-review-graph/evidence/`
- Reject symlink/junction traversal that resolves outside the allowed root.
- Cross-check:
  - `adapterRunId` matches artifact content.
  - `evidenceDigest` matches artifact bytes.
  - `crgCliVersion` is present.
  - each required stage has valid operation and exit code metadata.

## changedFiles/baseRef Resolver
- changed file sources:
  1. verdict JSON `changedFiles`
  2. `WORKSETS.yaml` `ownedPaths`
  3. attempt manifest or runner changed ledger
  4. `git diff --name-only <base>...HEAD`
- base ref sources:
  1. explicit phase base/ref
  2. upstream merge-base
  3. `HEAD~1`
  4. unresolved
- If unresolved under strict/workflow_core/runtime_adapter, emit blocker `changed_files_unresolved`.

## Python Test Strategy
- Do not require `pytest`.
- Use stdlib `unittest` or a direct executable script so this harness repo has no new Python test dependency.

## Acceptance Criteria
- `AC-02`: missing required `execute/review/finish` coverage blocks code-changing strict closeout.
- `AC-05`: Node and Python validators produce identical decisions for shared fixtures.
- `AC-12`: evidenceArtifactPath outside allowed roots is rejected.

## Verification
```bash
node --test .claude/scripts/lib/code-review-graph-evidence.test.mjs
python .claude/agents/verification/code_review_graph_evidence_test.py
```

## Blockers
- Stop if Node/Python fixture parity cannot be achieved without duplicating business rules.

