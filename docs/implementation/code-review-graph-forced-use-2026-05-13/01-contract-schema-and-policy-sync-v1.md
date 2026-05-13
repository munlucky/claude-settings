# Phase 01 - Contract, Schema, and Policy Sync

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "sequential"
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - ".claude/config/code-suffixes.json"
    - ".claude/schemas/analysis-context.schema.yaml"
    - ".claude/config/workflow-bundles.yaml"
    - ".claude/docs/guidelines/code-review-graph-workflow.md"
    - ".codex/skills/completion-verifier/SKILL.md"
  readOnlyPaths:
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_contract"
```

## Goal
Define the CRG forced-use contract before implementation touches adapter or gate code.

## Tasks
- Add `.claude/config/code-suffixes.json` as the only code suffix source.
- Extend `analysisContext.codeReviewGraph` schema with structured evidence fields:
  - `evidenceSource`
  - `adapterVersion`
  - `adapterRunId`
  - `requiredStages`
  - `stageCoverage`
  - `changedFiles`
  - `evidenceArtifactPath`
  - `evidenceDigest`
- Update workflow bundle and CRG guideline policy:
  - `tool_unavailable:*` remains recordable evidence.
  - strict, workflow_core, and runtime_adapter profiles must block clean finish for code-changing work when CRG is missing, invalid, or unavailable.
  - prompt_only/docs_only may remain warning-only.
- Update completion verifier guidance so it no longer describes CRG unavailable as always workflow-continues.
- Fix the parser strategy:
  - Use marker-bounded JSON, not YAML.
  - Do not add a YAML dependency.
  - Do not implement regex/manual YAML parsing.

## CRG Marker Contract
````md
<!-- code-review-graph:evidence:v1:start -->
```json
{
  "codeReviewGraph": {
    "evidenceSource": "code-review-graph-stage.mjs",
    "adapterVersion": 1,
    "adapterRunId": "crg-...",
    "evidenceSchemaVersion": 1,
    "evidence": "selected",
    "requiredStages": ["execute", "review", "finish"],
    "changedFiles": {
      "source": "verdict_json",
      "baseRef": "<resolved-ref>",
      "baseRefSource": "upstream_merge_base"
    },
    "stageCoverage": {
      "execute": {
        "status": "selected",
        "operation": "graph_update",
        "operationExitCode": 0,
        "commandDigest": "code-review-graph:update:<hash>",
        "graphBefore": { "status": "empty", "nodes": 0, "files": 0 },
        "graphAfter": { "status": "ready", "nodes": 120, "files": 43 },
        "evidenceArtifactPath": "<allowed-root>/crg-....json",
        "evidenceDigest": "sha256:...",
        "evidenceRef": "qa-report:workflow-execution:code-review-graph",
        "createdAtUtc": "2026-05-13T00:00:01Z"
      }
    }
  }
}
```
<!-- code-review-graph:evidence:v1:end -->
````

## Acceptance Criteria
- `AC-01`: code suffix detection reads only `.claude/config/code-suffixes.json`.
- `AC-09`: CRG marker block parsing uses `JSON.parse` only.
- `AC-10`: schema and policy docs distinguish warning-only profiles from blocker profiles.

## Verification
```bash
node --check .claude/scripts/workflow-enforcement.mjs
bash .claude/scripts/workflow-enforcement.sh verify
```

## Blockers
- Stop if existing JSON parsing helpers cannot preserve marker blocks without rewriting unrelated QA content.
