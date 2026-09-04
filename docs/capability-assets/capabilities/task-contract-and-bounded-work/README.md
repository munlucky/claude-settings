# Task contract and bounded work

- **ID**: `task-contract-and-bounded-work`
- **Category**: `WORK`
- **Status**: `CORE`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
사용자 목적을 실행 가능한 계약과 제한된 work unit으로 바인딩한다.

## Subcapabilities Traceability
### `task-contract-binding` (CORE)
- **Name**: Task contract binding
- **Role**: 사용자 목적, 인수조건, 비목표를 불변 계약으로 바인딩
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/task/task-contract.mjs` (current source)
  - `scripts/kernel/run/contract-preflight.mjs` (current source)
  - `schemas/kernel.task-contract.schema.json` (current source)
  - `skills/moonshot-orchestrator/SKILL.md` (current source)
  - `skills/codex-validate-plan/SKILL.md` (current source)
  - `skills/pre-flight-check/SKILL.md` (current source)
  - `skills/project-contract-gate/SKILL.md` (current source)
  - `.claude/skills/moonshot-orchestrator/SKILL.md` (historical commit: `77ed33f1e1f3c1f0c44216b86d9df5123e58cbb7`)
- **Proof References**:
  - `task-contract-schema`
  - `bounded-work-unit`

### `work-unit-scope` (CORE)
- **Name**: Work unit scope
- **Role**: 허용/금지 경로 및 제한된 work-unit admission 경계 소유
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/run/work-unit-scope.mjs` (current source)
  - `skills/implementation-runner/SKILL.md` (current source)
  - `skills/task-slicer/SKILL.md` (current source)
  - `skills/karpathy-execution-gate/SKILL.md` (current source)
- **Proof References**:
  - `step-scope`


## Proof Tests
- **task-contract-schema**: `tests/active-contracts.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **bounded-work-unit**: `tests/kernel-bounded-work-unit.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **step-scope**: `tests/kernel-run-step-scope.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: 현재 Kernel의 실행 경계와 재현 가능한 작업 단위를 지탱하는 CORE capability다.
