# Control plane state authority

- **ID**: `control-plane-state-authority`
- **Category**: `EXECUTION`
- **Status**: `CORE`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
run, workflow, state projection과 durable repository의 권위를 단일 Kernel control plane으로 조정한다.

## Subcapabilities Traceability
### `state-transition-authority` (CORE)
- **Name**: State transition authority
- **Role**: 런타임 라이프사이클 상태 전이 단일 권위
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/control-plane.mjs` (current source)
  - `scripts/kernel/transition.mjs` (current source)
  - `bin/moon-relay-kernel.mjs` (current source)
  - `skills/moon-relay-kernel/SKILL.md` (current source)
- **Proof References**:
  - `control-plane-lifecycle`
  - `workflow-state-machine`

### `minimal-durable-state` (CORE)
- **Name**: Minimal durable state
- **Role**: SQLite 어댑터 기반 실행 상태 영속화 및 투영
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/state-store.mjs` (current source)
  - `scripts/kernel/state-projector.mjs` (current source)
  - `schemas/kernel.runtime-state.schema.json` (current source)
- **Proof References**:
  - `state-projection`


## Proof Tests
- **control-plane-lifecycle**: `tests/kernel-control-plane-lifecycle.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **workflow-state-machine**: `tests/kernel-workflow-state-machine.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **state-projection**: `tests/kernel-state-projection.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: Kernel이 Relay의 여러 orchestration surface를 대체하면서 보존해야 하는 핵심 authority capability다.
