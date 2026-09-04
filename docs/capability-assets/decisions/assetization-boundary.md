# Assetization Boundary Decision

## Decision

2026-09-04 기준으로 Capability Asset Base를 별도 engineering index로
추가한다. current canonical source와 Kernel은 그대로 유지하고, 과거
구현은 Git provenance와 증거 링크로만 자산화한다. 완료는 decomplexification,
runtime migration, 기능 재도입 또는 rollout의 승인이 아니다.

기준선은 main의
9701a86d2225c938f13982a7e0f7f43a7f9bc10e이며, 자산화 전 worktree가
clean임을 확인했다. commit은 immutable reference이고 source snapshot은
복사하지 않는다.

## 포함과 제외

포함: Capability 문제·계약·권위·dependency, Relay/Kernel epoch,
generation과 구현 경로, test/fixture/smoke, known failure와 lesson,
현재 통합, 분류, 재도입 조건, 결정과 validator/freeze 보고.

제외: control plane, Run state, Step Ledger, database, provider,
completion authority, knowledge lifecycle 동작 변경, 소스 삭제·이동,
문서만으로 receipt 위조, migration, production rollout, commit/push.

## 원칙

1. Canonical source가 asset manifest보다 우선한다.
2. 현재 통합과 역사적 보존을 current_integration과 origin으로 분리한다.
3. 재도입 후보에는 layer, trigger, integration points, risks, guardrails를 둔다.
4. CORE는 현재 사용과 실행 가능한 proof 없이는 부여하지 않는다.
5. DEPRECATED와 REFERENCE도 provenance와 실패 교훈을 보존한다.
6. 중복·상속은 기록하되 기존 구현을 임의로 합치거나 삭제하지 않는다.
7. freeze는 no-proof와 unresolved를 0으로 꾸미지 않는다.

Wave 0은 vocabulary와 경계만 고정한다. Wave 1~3은 읽기 전용 archaeology,
Wave 4~7은 manifest와 guide, Wave 8은 validator와 baseline freeze다.
재도입은 별도 contract, scope, proof, review와 completion authority를
다시 받아야 한다.
