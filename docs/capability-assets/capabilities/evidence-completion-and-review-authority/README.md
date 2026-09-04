# Evidence, completion, and review authority

- **ID**: `evidence-completion-and-review-authority`
- **Domain**: `TRUST`
- **Family Status**: `CORE`
- **Summary**: 실행 증거와 review receipt를 completion gate에 연결해 서술과 실제 실행을 분리한다.

## Subcapabilities (Decomplexification 단위)
- **`evidence-binding`** [`CORE`]: 실증 증거 수집 및 인수조건 의무 바인딩
- **`verification-authority`** [`CORE`]: 검증 실행 결과 평가 및 통과 여부 단일 권위
- **`completion-decision`** [`CORE`]: 최종 완료 판정 및 릴리즈 승인 게이트
- **`protected-obligation`** [`CORE`]: 고위험 변경에 대한 필수 검증 의무 강제
- **`independent-reviewer-execution`** [`OPTIONAL`]: 독립 컨텍스트 리뷰어 실행 및 판정 도출
- **`review-transport`** [`HOST`]: 외부 리뷰어 세션 브릿지 및 프로토콜 전송

## 해결하는 문제
- 문서상 완료와 실제 검증 성공이 분리되는 문제
- review 의견과 authoritative receipt가 섞이는 문제

## 해결하지 않는 문제
- 증명되지 않은 외부 서비스의 live availability
- 잘못 설계된 acceptance의 품질

## 권장 사용
- 검증 command, source identity, artifact identity와 receipt를 함께 기록한다.
- protected review가 필요한 경우 독립 receipt를 요구한다.

## 금지 사용
- markdown summary나 test path 목록을 실행 evidence로 가장하지 않는다.
- reviewer 의견을 Kernel completion receipt로 수동 복사하지 않는다.

## 재도입 가이드
- **권장 레이어**: Kernel verification and close gate
- **트리거**: 새 acceptance 또는 protected review obligation을 추가할 때
- **통합 지점**:
  - evidence plan
  - proof executor
  - review receipt
  - finalization gate
- **위험 요소**:
  - 오래된 receipt 재사용
  - reviewer와 owner binding 혼동
  - soft evidence를 hard evidence로 승격
- **안전 가드레일**:
  - source/artifact/command digest freshness
  - protected obligation의 independent receipt
  - completion gate는 Kernel만 소유
