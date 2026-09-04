# Task contract and bounded work

- **ID**: `task-contract-and-bounded-work`
- **Domain**: `WORK`
- **Status**: `CORE`
- **Summary**: 사용자 목적을 실행 가능한 계약과 제한된 work unit으로 바인딩한다.

## 해결하는 문제
- 모호한 요청이 무제한 변경으로 확장되는 문제
- acceptance와 non-goal이 실행 중 유실되는 문제

## 해결하지 않는 문제
- 제품 요구사항 자체의 우선순위 결정
- 계약만으로 보장할 수 없는 provider live 성공

## 권장 사용
- 작업 시작 전에 objective, acceptance, constraints, non-goals를 고정한다.
- 각 실행은 허용 경로와 한정된 work unit을 갖게 한다.

## 금지 사용
- 계약을 runtime feature registry로 사용하지 않는다.
- 불명확한 요구를 임의의 기능으로 채우지 않는다.

## 재도입 가이드
- **권장 레이어**: Kernel task admission
- **트리거**: 새 실행 surface가 사용자 요청을 받거나 기존 work unit을 재개할 때
- **통합 지점**:
  - task contract preflight
  - step/work-unit scope
  - completion evidence plan
- **위험 요소**:
  - 계약 범위를 넓혀 legacy 기능을 암묵적으로 재도입할 수 있음
  - 외부 provider 상태를 로컬 계약으로 과장할 수 있음
- **안전 가드레일**:
  - 계약 변경은 replan으로 기록
  - 외부 실행은 host receipt로 별도 증명
  - asset manifest는 runtime에서 읽지 않음
