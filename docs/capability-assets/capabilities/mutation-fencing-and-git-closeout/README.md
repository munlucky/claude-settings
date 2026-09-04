# Mutation fencing and Git closeout

- **ID**: `mutation-fencing-and-git-closeout`
- **Domain**: `TRUST`
- **Family Status**: `CORE`
- **Summary**: 허용된 mutation만 통과시키고 Git index, commit, remote parity를 안전한 closeout 경계로 묶는다.

## Subcapabilities (Decomplexification 단위)
- **`mutation-scope-safety`** [`CORE`]: 선언된 경로 외의 임의 파일 변조 차단
- **`workspace-fencing`** [`CORE`]: 작업 공간 분리 및 외부 파일 유출 차단
- **`git-staging-safety`** [`HOST`]: Git 스테이징 정책 및 제외 파일 보호
- **`git-commit`** [`HOST`]: 작업 문맥 기반 커밋 메시지 생성 및 로컬 커밋
- **`remote-parity`** [`OPTIONAL`]: 원격 저장소 푸시 및 remote parity 검증

## 해결하는 문제
- proof가 workspace를 변경해 evidence를 오염시키는 문제
- 의도하지 않은 파일이 commit/closeout에 섞이는 문제

## 해결하지 않는 문제
- 사용자가 명시하지 않은 commit/push 권한을 부여하는 것
- 변경 내용의 제품적 정당성

## 권장 사용
- mutation 전 allowed path와 ancestry를 확인한다.
- closeout 시 index integrity, source identity와 remote parity를 별도 증명한다.

## 금지 사용
- 검증 실패를 숨기기 위해 reset/checkout으로 workspace를 덮지 않는다.
- assetization 범위를 벗어난 runtime 파일을 임의로 고치지 않는다.

## 재도입 가이드
- **권장 레이어**: workspace mutation and closeout
- **트리거**: 새 task가 파일 mutation 또는 사용자 요청 Git closeout을 수행할 때
- **통합 지점**:
  - scope admission
  - mutation lock
  - staging policy
  - closeout receipt
- **위험 요소**:
  - legacy cleanup가 사용자 변경을 삭제할 위험
  - 검증 output이 tracked surface를 키울 위험
- **안전 가드레일**:
  - exact path/ancestry preflight
  - no destructive reset by default
  - commit/push explicit request only
