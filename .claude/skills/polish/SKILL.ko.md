---
name: polish
description: 출시 전 UI의 간격, 정렬, 상태, 모션, 문구, 시각적 일관성을 마지막으로 다듬는 스킬입니다.
license: Apache 2.0. pbakaus/impeccable 기반으로 조정됨.
metadata:
  author: pbakaus
  source: https://github.com/pbakaus/impeccable
user-invocable: true
argument-hint: "[target]"
---

# Polish

기능이 이미 동작하는 상태에서 마지막 품질 보정을 할 때 사용합니다.

## 준비

먼저 `frontend-design`을 로드하고 다음을 확인합니다.
- 기능이 마감 작업을 할 만큼 완성되었는지
- 품질 기준이 무엇인지 (`MVP` 또는 `flagship`)
- 당장 유지해야 하는 알려진 제한 사항이 있는지

## 최종 점검 목록

다음을 점검하고 정리합니다.
- 정렬과 간격 리듬
- 타이포 계층
- hover, focus, active, disabled, loading, error, success 상태
- 문구 일관성
- 모바일과 데스크톱 동작
- 대비와 키보드 사용성
- 모션의 부드러움과 reduced-motion 대응
- 콘솔 노이즈, 죽은 코드, 명백한 정리 대상

## 가드레일

- 기능이 제대로 동작하기 전에는 polish를 시작하지 않습니다.
- polish 단계에서 새 개념을 도입하지 않습니다.
- 가능하면 반복 문제를 근본 원인에서 해결합니다.
- 시각 또는 인터랙션 변경 후 다시 검증합니다.
