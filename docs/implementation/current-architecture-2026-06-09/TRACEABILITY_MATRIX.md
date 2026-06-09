# Traceability Matrix

| Requirement ID | Evidence Path | ASR ID | Option ID | ADR ID | Spec Delta ID | Task ID | Owner | Verification Signal |
|---|---|---|---|---|---|---|---|---|
| REQ-101 | docs/public/repository-layout.md | ASR-101 | OPT-101 | ADR-0101 | DELTA-101 | TASK-101 | repository | package/layout/materialization contracts pass |
| REQ-102 | package/runtime-surface.json | ASR-102 | OPT-101 | ADR-0101 | DELTA-102 | TASK-102 | package | `npm run test:package` and runtime-surface contract tests pass |
| REQ-103 | docs/public/runtime-control-plane.md | ASR-103 | OPT-101 | ADR-0101 | DELTA-103 | TASK-103 | runtime-state | runtime-control-plane and completion-authority contract tests pass |
| REQ-104 | schemas/verification.contract.yaml | ASR-104 | OPT-101 | ADR-0101 | DELTA-104 | TASK-104 | verification | verification-plane and completion-authority contract tests pass |
| REQ-105 | rules/workflow-bundles.yaml | ASR-105 | OPT-101 | ADR-0101 | DELTA-105 | TASK-105 | workflow | workflow-e2e and runtime-surface contract tests pass |
| REQ-106 | docs/public/project-knowledge-plane.md | ASR-106 | OPT-101 | ADR-0101 | DELTA-106 | TASK-106 | knowledge | knowledge-context-build and memory-promotion contract tests pass |
| REQ-107 | scripts/architecture-context-build.mjs | ASR-107 | OPT-101 | ADR-0101 | DELTA-107 | TASK-107 | architecture | architecture artifact validation passes |
