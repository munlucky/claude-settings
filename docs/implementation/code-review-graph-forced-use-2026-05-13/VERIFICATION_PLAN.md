# Verification Plan

## Required Commands After Implementation
```bash
node --check .claude/scripts/code-review-graph-stage.mjs
node --test .claude/scripts/code-review-graph-stage.test.mjs
node --test .claude/scripts/lib/code-review-graph-evidence.test.mjs
python .claude/agents/verification/code_review_graph_evidence_test.py
bash .claude/scripts/workflow-enforcement.sh verify
bash .claude/scripts/verify-phase-runner-boundary.sh
node --test .claude/scripts/verify-phase-closeout.test.mjs
PHASE_RUNTIME_PARITY_KEEP_TMP=true bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan
```

## Expected Pass Signals
- Node adapter and validator tests pass.
- Python validator parity script exits 0 without requiring `pytest`.
- Workflow enforcement verify exits 0.
- Phase boundary and runtime parity checks pass.
- Closeout tests include CRG structured pass and string-only failure cases.

## Expected Failure Fixtures
- CRG missing for strict code change.
- CRG selected string only.
- missing required stage coverage.
- duplicate marker block.
- malformed JSON marker block.
- artifact path outside allowed root.
- digest mismatch.
- graph empty treated as not ready.
- changedFiles unresolved under strict profile.

