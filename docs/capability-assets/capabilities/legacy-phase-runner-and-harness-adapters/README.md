# Legacy phase runner and harness adapters

- **ID**: `legacy-phase-runner-and-harness-adapters`
- **Category**: `EXECUTION`
- **Status**: `DEPRECATED`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
Relay phase/lease/artifact/harness 구현과 실패 교훈을 삭제하지 않고 비교용 historical asset으로 보존한다.

## Subcapabilities Traceability
### `legacy-phase-runner` (DEPRECATED)
- **Name**: Legacy phase runner
- **Role**: 구 Relay phase 실행 및 임차 정책 (비교용)
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `archive/scripts/legacy-phase-adapters/agent-loop-phase-runner.mjs` (current source)
  - `archive/scripts/legacy-phase-adapters/agent-loop-phase-runtime.mjs` (current source)
  - `skills/moonshot-phase-runner/SKILL.md` (current source)
  - `skills/moonshot-phase-executor/SKILL.md` (current source)
  - `.claude/skills/moonshot-phase-runner/SKILL.md` (historical commit: `1131912154b8c4e2c077f81bc7ee15fee440d302`)
- **Proof References**:
  - `legacy-phase-runner`
  - `legacy-phase-runtime`

### `legacy-harness-adapters` (DEPRECATED)
- **Name**: Legacy harness adapters
- **Role**: 아카이브된 과거 하네스 어댑터 (재도입 금지)
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `archive/scripts/legacy-phase-adapters/agent-loop-phase-state.mjs` (current source)
  - `archive/scripts/legacy-phase-adapters/harness-surface-inventory.mjs` (current source)
- **Proof References**:
  - `legacy-harness-inventory`


## Proof Tests
- **legacy-phase-runner**: `archive/scripts/legacy-phase-adapters/agent-loop-phase-runner.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test:legacy-archive`
- **legacy-phase-runtime**: `archive/scripts/legacy-phase-adapters/agent-loop-phase-runtime.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test:legacy-archive`
- **legacy-harness-inventory**: `archive/scripts/legacy-phase-adapters/harness-surface-inventory.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test:legacy-archive`

## Decision
- **Disposition**: `archive`
- **Rationale**: Relay 역사와 실패 교훈은 보존하지만 현재 Kernel runtime에 재도입하지 않는다.
