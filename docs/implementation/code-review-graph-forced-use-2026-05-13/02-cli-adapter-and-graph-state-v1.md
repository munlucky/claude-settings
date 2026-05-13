# Phase 02 - CLI Adapter and Graph State

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "sequential"
  dependsOn: ["01-contract-schema-and-policy-sync-v1.md"]
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/code-review-graph-stage.mjs"
    - ".claude/scripts/code-review-graph-stage.test.mjs"
    - ".claude/scripts/lib/code-review-graph-evidence-block.mjs"
    - ".claude/logs/code-review-graph/"
  readOnlyPaths:
    - ".claude/docs/guidelines/code-review-graph-workflow.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_adapter"
```

## Goal
Create the repo-local CLI adapter that autonomous runners use as the official CRG execution path.

## Adapter Interface
```bash
node .claude/scripts/code-review-graph-stage.mjs run \
  --stage <plan|execute|review|verify|finish> \
  --repo . \
  --base <ref> \
  --evidence-carrier <bounded|phase> \
  --analysis-file .claude/docs/moonshot-analysis.yaml \
  --phase-execution-dir <execution-dir>
```

## Required Behavior
- Force UTF-8 environment for child processes.
- Serialize graph operations and evidence writes with `.code-review-graph/.stage.lock`.
- For `verify`, do not run build/update/detect. Only validate existing evidence.
- For `finish`, write `persist_summary` coverage only. Do not execute a new graph operation.
- If `status` returns `nodes=0` or `files=0`, treat graph as `graph_empty`, not ready.
- Failure taxonomy:
  - `tool_unavailable:base_ref_unavailable`
  - `tool_unavailable:graph_empty`
  - `tool_unavailable:graph_corrupt`
  - `tool_unavailable:graph_rebuild_failed`
  - `tool_unavailable:graph_corrupt_rebuild_failed`
  - `tool_unavailable:lock_timeout`
  - `tool_unavailable:command_not_found`
  - `tool_unavailable:qa_report_missing`

## Atomic Write Contract
- Evidence artifact:
  - Write `<adapterRunId>.json.tmp`.
  - Flush and close.
  - Compute digest from final JSON bytes.
  - Rename to `<adapterRunId>.json` using atomic rename.
- QA/analysis update:
  - Build the full next file in memory.
  - Write `<target>.tmp`.
  - Rename over target only after successful write.
  - If any step fails, leave the previous target unchanged and do not leave a partial marker block.
- Artifact allowed roots:
  - phase: `<phase-execution-dir>/evidence/code-review-graph/`
  - bounded: `.claude/logs/code-review-graph/evidence/`

## Acceptance Criteria
- `AC-03`: string-only stageCoverage without adapter artifact cross-check fails.
- `AC-04`: empty/corrupt/rebuild failure states are distinguishable.
- `AC-11`: evidence writes are tmp plus atomic rename.

## Verification
```bash
node --check .claude/scripts/code-review-graph-stage.mjs
node --test .claude/scripts/code-review-graph-stage.test.mjs
```

## Blockers
- Stop if atomic rename cannot be implemented consistently on the current Windows path.

