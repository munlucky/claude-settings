# Standalone architecture and research tools

- **ID**: `standalone-architecture-and-research-tools`
- **Category**: `PRODUCTIVITY`
- **Status**: `OPTIONAL`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
architecture, product definition, research, diff, UI audit과 project-memory를 비런타임 도구로 제공한다.

## Subcapabilities Traceability
### `architecture-artifacts` (OPTIONAL)
- **Name**: Architecture artifacts
- **Role**: 아키텍처 설계 산출물 및 계약 시드 생성
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/standalone/architecture-artifacts.mjs` (current source)
  - `scripts/kernel/standalone/product-definition.mjs` (current source)
  - `skills/moonshot-architecture/SKILL.md` (current source)
  - `skills/architecture-artifacts/SKILL.md` (current source)
  - `skills/product-definition/SKILL.md` (current source)
  - `skills/product-orchestrator/SKILL.md` (current source)
- **Proof References**:
  - `architecture-contract`

### `codebase-understanding` (OPTIONAL)
- **Name**: Codebase understanding
- **Role**: 코드베이스 인덱스 구축 및 질의 인터페이스
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `bin/codebase-understanding.mjs` (current source)
  - `skills/codebase-understanding/SKILL.md` (current source)
- **Proof References**:
  - `architecture-handoff`

### `standalone-diff-and-audit` (OPTIONAL)
- **Name**: Standalone diff and audit
- **Role**: 변경 설명 HTML 렌더링 및 UI 접근성 감사
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: false
- **Implementation References**:
  - `scripts/kernel/standalone/explain-diff-html.mjs` (current source)
  - `scripts/kernel/standalone/ui-audit.mjs` (current source)
  - `skills/explain-diff-html/SKILL.md` (current source)
  - `skills/ui-audit/SKILL.md` (current source)
  - `skills/product-gate-reviewer/SKILL.md` (current source)
- **Proof References**:
  - `research-evidence`


## Proof Tests
- **architecture-contract**: `tests/architecture-contract-bind.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **architecture-handoff**: `tests/architecture-handoff-build.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **research-evidence**: `tests/research-evidence-contract.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: 구현 품질을 보조하는 OPTIONAL productivity capability로 보존하되 runtime authority와 분리한다.
