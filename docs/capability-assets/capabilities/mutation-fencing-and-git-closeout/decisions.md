# Capability Decisions: Mutation fencing and Git closeout

- **Capability ID**: `mutation-fencing-and-git-closeout`
- **Disposition**: `retain`
- **Subcapabilities Count**: 5

## Rationale
신뢰 경계와 사용자 변경 보존을 동시에 지키는 현재 CORE capability다.

## Subcapabilities Allocation
- **Mutation scope safety** (`mutation-scope-safety`): `CORE` — 선언된 경로 외의 임의 파일 변조 차단
  - Implementations: 1 files bound
  - Proofs: mutation-guard
- **Workspace fencing** (`workspace-fencing`): `CORE` — 작업 공간 분리 및 외부 파일 유출 차단
  - Implementations: 1 files bound
  - Proofs: mutation-guard
- **Git staging safety** (`git-staging-safety`): `HOST` — Git 스테이징 정책 및 제외 파일 보호
  - Implementations: 1 files bound
  - Proofs: git-index-integrity
- **Git commit** (`git-commit`): `HOST` — 작업 문맥 기반 커밋 메시지 생성 및 로컬 커밋
  - Implementations: 5 files bound
  - Proofs: git-closeout
- **Remote parity** (`remote-parity`): `OPTIONAL` — 원격 저장소 푸시 및 remote parity 검증
  - Implementations: 1 files bound
  - Proofs: git-closeout

## Follow-up Directives
- 모든 future asset validator는 read-only여야 하며 generated state를 payload에 포함하지 않는다.
