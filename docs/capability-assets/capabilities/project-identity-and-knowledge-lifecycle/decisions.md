# Capability Decisions: Project identity and knowledge lifecycle

- **Capability ID**: `project-identity-and-knowledge-lifecycle`
- **Disposition**: `retain`
- **Subcapabilities Count**: 2

## Rationale
프로젝트 지식의 scope와 lifecycle을 보호하는 현재 CORE capability다.

## Subcapabilities Allocation
- **Project identity binding** (`project-identity-binding`): `CORE` — 프로젝트 고유 식별자 확정 및 네임스페이스 격리
  - Implementations: 2 files bound
  - Proofs: project-identity, identity-review-remediation
- **Knowledge lifecycle authority** (`knowledge-lifecycle-authority`): `CORE` — 지식 레코드 개정, 대체, 저장 권위
  - Implementations: 7 files bound
  - Proofs: knowledge-freshness

## Follow-up Directives
- legacy namespace remediation은 자산화와 별도 승인 작업으로 유지한다.
