# Code Review Graph Forced Use Plan v12.1

## Source Baseline
- User request: force real `code-review-graph` use for code exploration, implementation impact review, and closeout gates.
- Current repo state checked on 2026-05-13:
  - `code-review-graph --version`: `2.3.2`
  - `code-review-graph status --repo .`: `Nodes: 0`, `Files: 0`, `Last updated: never`
  - `.claude/config/code-suffixes.json`: missing
  - `.claude/scripts/code-review-graph-stage.mjs`: missing
  - this plan package: newly created
- Existing truth surfaces to update during implementation:
  - `.claude/docs/guidelines/code-review-graph-workflow.md`
  - `.claude/config/workflow-bundles.yaml`
  - `.claude/schemas/analysis-context.schema.yaml`
  - phase and bounded closeout scripts that currently only read generic `selectedHarnessComponents`.

## Objective
Make `code-review-graph` a real stage-gated harness component. Code-changing work must prove adapter-originated CRG usage for required stages before clean finish can pass.

## Non-Goals
- Do not run installer-time graph build, watch, or daemon.
- Do not store raw CRG stdout/stderr in QA reports, verdict JSON, MemoryGraph, or committed artifacts.
- Do not make MCP direct access the autonomous runner source of truth. MCP remains an interactive optimization path only.
- Do not modify active `.claude/docs/phase-status.yaml` or current runtime state while creating this docs-only package.

## Phase Index
| Phase | Plan File | Purpose | Status |
|---|---|---|---|
| 01 | `01-contract-schema-and-policy-sync-v1.md` | Schema, suffix source, parser strategy, policy sync | Planned |
| 02 | `02-cli-adapter-and-graph-state-v1.md` | CLI adapter, graph state taxonomy, atomic writes | Planned |
| 03 | `03-validator-parity-and-resolver-v1.md` | Node/Python validator parity, changedFiles/baseRef resolver | Planned |
| 04 | `04-bounded-phase-closeout-gates-v1.md` | Bounded, verification, phase, and plan closeout gates | Planned |
| 05 | `05-fixtures-parity-and-readiness-v1.md` | Fixtures, parity validation, readiness closeout | Planned |

## Parallel Execution Plan
- Phase 01 must run first because it defines shared schemas and policy.
- Phase 02 and Phase 03 are sequential because the validator contract depends on adapter artifact shape.
- Phase 04 depends on Phase 03 and is sequential because it touches shared closeout paths.
- Phase 05 runs last because fixture expectations depend on all gate behavior.

## Key Contracts
- CRG evidence block format uses marker-bounded JSON, not YAML. Node has no YAML stdlib and ad hoc YAML parsing is forbidden.
- Adapter evidence artifacts are written only under allowed roots:
  - phase: `<phase-execution-dir>/evidence/code-review-graph/`
  - bounded: `.claude/logs/code-review-graph/evidence/`
- Validators must resolve `evidenceArtifactPath` with `realpath` and reject paths outside the allowed root.
- Adapter artifact writes and QA/analysis updates use temp file plus atomic rename. Partial marker blocks must never be written.
- `stageCoverage.finish` means `persist_summary`; it must not run a new CRG build/update/detect operation.
- `verify` stage only checks existing CRG evidence. It must not build, update, or detect changes.

## Traceability
See `TRACEABILITY.md` for requirement and acceptance-criteria mapping.

## Plan Quality Loop
```yaml
planQualityLoop:
  controllerDecision: pass_for_document_package_creation
  implementationVerdict: conditional_pass
  isolationMode: forked
  reviewerAgent: 019e20db-0508-7622-8a9a-eb15c99a4bee
  writerAgent: 019e20db-2f15-7571-9d78-a896ef18cee4
  ambiguityScore: 0.16
  requiredChangesApplied:
    - CRG marker block parser/dependency strategy fixed to marker JSON
    - evidenceArtifactPath canonical allowed-root validation added
    - adapter artifact and carrier writes fixed to tmp plus atomic rename
```

## Phase Completion Checklist
- [ ] Phase 01 - Contract, Schema, and Policy Sync (`01-contract-schema-and-policy-sync-v1.md`)
- [x] Phase 02 - CLI Adapter and Graph State (`02-cli-adapter-and-graph-state-v1.md`)
- [ ] Phase 03 - Validator Parity and Resolver (`03-validator-parity-and-resolver-v1.md`)
- [ ] Phase 04 - Bounded and Phase Closeout Gates (`04-bounded-phase-closeout-gates-v1.md`)
- [ ] Phase 05 - Fixtures, Parity, and Readiness (`05-fixtures-parity-and-readiness-v1.md`)

