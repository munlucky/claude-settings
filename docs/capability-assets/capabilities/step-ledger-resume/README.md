# Step ledger and resume

- **ID**: `step-ledger-resume`
- **Category**: `WORK`
- **Status**: `CORE`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
실행 단계를 durable cursor와 lease로 기록하고 중단 후 안전하게 재개한다.

## Subcapabilities Traceability
### `run-step-ledger` (CORE)
- **Name**: Run step ledger
- **Role**: 단계별 순차 실행 상태 및 영속 원장 권위 유지
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/run/run-step-ledger.mjs` (current source)
  - `scripts/kernel/run/step-planner.mjs` (current source)
  - `skills/moonshot-plan-writer/SKILL.md` (current source)
  - `skills/moonshot-classify-task/SKILL.md` (current source)
  - `archive/scripts/legacy-phase-adapters/agent-loop-phase-plan.mjs` (historical commit: `1f7ed38b80f2d66d34498548448423c56154be16`)
- **Proof References**:
  - `run-step-ledger`
  - `run-step-safe-scope`

### `work-cursor-resume` (CORE)
- **Name**: Work cursor resume
- **Role**: 실행 커서 및 안전한 세션 재개 단일 권위
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/run/work-cursor.mjs` (current source)
  - `scripts/kernel/run/work-unit-scope.mjs` (current source)
  - `skills/moonshot-decide-sequence/SKILL.md` (current source)
  - `skills/moonshot-detect-uncertainty/SKILL.md` (current source)
  - `skills/moonshot-evaluate-complexity/SKILL.md` (current source)
- **Proof References**:
  - `run-step-resume`


## Proof Tests
- **run-step-ledger**: `tests/kernel-run-step-ledger.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **run-step-resume**: `tests/kernel-run-step-resume.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **run-step-safe-scope**: `tests/kernel-run-step-scope.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: Relay의 phase 진행 자산을 Kernel의 단일 step ledger로 통합해 보존할 가치가 있는 CORE capability다.
