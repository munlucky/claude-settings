# Project identity and knowledge lifecycle

- **ID**: `project-identity-and-knowledge-lifecycle`
- **Category**: `KNOWLEDGE`
- **Status**: `CORE`
- **Catalog Version**: `4`
- **Baseline Version**: `2.1`

## Summary
프로젝트 identity, knowledge namespace와 revision lifecycle을 안전한 scope에 묶는다.

## Subcapabilities Traceability
### `project-identity-binding` (CORE)
- **Name**: Project identity binding
- **Role**: 프로젝트 고유 식별자 확정 및 네임스페이스 격리
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/project-identity.mjs` (current source)
  - `scripts/kernel/project-identity-preflight.mjs` (current source)
- **Proof References**:
  - `project-identity`
  - `identity-review-remediation`

### `knowledge-lifecycle-authority` (CORE)
- **Name**: Knowledge lifecycle authority
- **Role**: 지식 레코드 개정, 대체, 저장 권위
- **Product Relevance**: Agent Workflow: true, Knowledge Lifecycle: true
- **Implementation References**:
  - `scripts/kernel/knowledge/records.mjs` (current source)
  - `scripts/kernel/knowledge/revision.mjs` (current source)
  - `scripts/kernel/knowledge/freshness.mjs` (current source)
  - `skills/project-memory/SKILL.md` (current source)
  - `skills/project-memory-refresh/SKILL.md` (current source)
  - `skills/harness-memory-promoter/SKILL.md` (current source)
  - `skills/project-md-refresh/SKILL.md` (current source)
- **Proof References**:
  - `knowledge-freshness`


## Proof Tests
- **project-identity**: `tests/kernel-project-identity.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **identity-review-remediation**: `tests/kernel-project-identity-review-remediation.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`
- **knowledge-freshness**: `tests/kernel-knowledge-freshness.test.mjs` (referenceStatus: `verified`, executionStatus: `historical-pass`) — command: `test`

## Decision
- **Disposition**: `retain`
- **Rationale**: 프로젝트 지식의 scope와 lifecycle을 보호하는 현재 CORE capability다.
