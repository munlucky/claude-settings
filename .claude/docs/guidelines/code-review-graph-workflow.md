# code-review-graph Workflow

`code-review-graph` is the code-structure analysis backend. MemoryGraph remains the source for working memory, policy, conventions, and decisions. Do not copy raw graph output into MemoryGraph.

## Operating Mode

```yaml
codeReviewGraph:
  mode: stage_gated
  buildMode: lazy_update
  backend: code-review-graph
  graphStatus: unknown | not_built | stale | fresh | unavailable
  stageCoverage: plan | execute | review | verify | finish
```

The graph is never built by the installer and never kept warm by `watch` or `crg-daemon`. It is checked only at stages where code structure analysis is useful.

## Activation

Activate the gate when:
- `executionPlane` is `product_project` or `meta_harness`
- the current stage requires code reading, code editing, review, impact analysis, architecture overview, large-function detection, or blast-radius reduction

For `read_only`, activate only when the user explicitly asks for code analysis, review context, impact radius, architecture overview, or similar structure analysis.

If the tool is missing or fails, set:

```yaml
analysisContext.codeReviewGraph.graphStatus: unavailable
analysisContext.codeReviewGraph.warnings:
  - "code-review-graph unavailable: <short reason>"
```

The workflow continues unless another verifier or policy gate fails independently.

## Lazy Update Procedure

1. At stage entry, check status with MCP `list_graph_stats` when available, otherwise `code-review-graph status --repo .`.
2. If the graph is missing or stale and the stage actually needs code structure analysis, run MCP `build_or_update_graph` or CLI `code-review-graph update --repo .` / `code-review-graph build --repo .`.
3. Summarize the useful result into `analysisContext.codeReviewGraph.*Summary` in 5 lines or fewer.
4. Record the tool or fallback command in `analysisContext.codeReviewGraph.toolsUsed`.
5. Never paste raw graph dumps, full tool output, or `.code-review-graph/` contents into the main context, MemoryGraph, or committed artifacts.

## Stage Contract

| Stage | Use | Summary |
|---|---|---|
| `plan` | Before broad file reads for code work, use minimal context, architecture overview, semantic search, or large-function scan. | related modules/files, architecture risks, large-function candidates |
| `execute` | Before edits, narrow target files, likely dependencies, and impact radius. | target files, likely dependencies, impact radius |
| `review` | For changed files, use detect changes, review context, and impact radius. | changed files, impacted callers/importers/tests, review context |
| `verify` | Do not create a new graph. If CRG was used earlier, record whether evidence is present and whether the graph was stale. | evidence state and warnings only |
| `finish` | Persist summary-only evidence to workflow evidence. | selected or skipped harness component reason |

## Workflow Evidence

When used, add `code-review-graph` to `workflowEvidence.selectedHarnessComponents`.

When skipped, add it to `workflowEvidence.skippedHarnessComponents` with a concrete reason such as:
- `non_code_task`
- `explicit_analysis_not_requested`
- `tool_unavailable`
- `graph_not_needed_for_scope`

## Tool Policy

Prefer MCP tools when registered. If MCP names differ at runtime, use the nearest equivalent and record the actual name in `toolsUsed`.

Expected capabilities include:
- minimal context
- build or update graph
- graph stats/status
- impact radius
- review context
- graph query
- change detection
- semantic node search
- large-function detection
- architecture overview

`code-review-graph 2.3.2 serve --repo` does not expose a `--tools` allowlist flag. Tool restriction is enforced by this workflow contract, not by wrapper arguments.

## Forbidden

- installer-time build
- automatic background calls outside a stage gate
- `watch`
- `crg-daemon start`
- storing `.code-review-graph/` in git
- copying raw graph output into MemoryGraph
- replacing MemoryGraph policy/decision memory with code-review-graph analysis

## Windows Notes

PowerShell `pipx` shims can fail if the generated executable points at a stale Python path. The wrapper supports Git Bash fallback and should remain the official Windows path for MCP startup.
