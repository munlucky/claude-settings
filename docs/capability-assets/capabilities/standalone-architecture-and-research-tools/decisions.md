# Capability Decisions: Standalone architecture and research tools

- **Capability ID**: `standalone-architecture-and-research-tools`
- **Disposition**: `retain`
- **Subcapabilities Count**: 3

## Rationale
구현 품질을 보조하는 OPTIONAL productivity capability로 보존하되 runtime authority와 분리한다.

## Subcapabilities Allocation
- **Architecture artifacts** (`architecture-artifacts`): `OPTIONAL` — 아키텍처 설계 산출물 및 계약 시드 생성
  - Implementations: 6 files bound
  - Proofs: architecture-contract
- **Codebase understanding** (`codebase-understanding`): `OPTIONAL` — 코드베이스 인덱스 구축 및 질의 인터페이스
  - Implementations: 2 files bound
  - Proofs: architecture-handoff
- **Standalone diff and audit** (`standalone-diff-and-audit`): `OPTIONAL` — 변경 설명 HTML 렌더링 및 UI 접근성 감사
  - Implementations: 5 files bound
  - Proofs: research-evidence

## Follow-up Directives
- 새 standalone tool은 artifact schema와 authority disclaimer를 함께 제공한다.
