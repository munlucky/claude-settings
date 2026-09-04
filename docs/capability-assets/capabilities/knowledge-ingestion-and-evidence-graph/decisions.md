# Capability Decisions: Knowledge ingestion and evidence graph

- **Capability ID**: `knowledge-ingestion-and-evidence-graph`
- **Disposition**: `retain`
- **Subcapabilities Count**: 2

## Rationale
프로젝트 지식 lifecycle과 failure learning을 안전하게 연결하는 현재 CORE capability다.

## Subcapabilities Allocation
- **Knowledge ingestion normalization** (`knowledge-ingestion-normalization`): `CORE` — 지식 수집, 정규화, 중복 제거 및 충돌 검사
  - Implementations: 4 files bound
  - Proofs: knowledge-candidate
- **Ontology gate promotion** (`ontology-gate-promotion`): `CORE` — 온톨로지 제약 평가 및 프로젝트 지식 승격
  - Implementations: 5 files bound
  - Proofs: knowledge-store, knowledge-lifecycle

## Follow-up Directives
- asset validator는 knowledge store에 접근하지 않고 manifest evidence만 검사한다.
