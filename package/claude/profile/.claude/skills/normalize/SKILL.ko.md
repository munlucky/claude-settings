---
name: normalize
description: UI를 저장소의 디자인 시스템, 토큰, 간격 체계, 기존 컴포넌트 패턴에 다시 맞추는 스킬입니다.
surfaceStatus: optional_bundle_member
license: Apache 2.0. pbakaus/impeccable 기반으로 조정됨.
metadata:
  author: pbakaus
  source: https://github.com/pbakaus/impeccable
user-invocable: false
argument-hint: "[feature]"
---

# Normalize

## 공개 범위

이 스킬은 세부 frontend helper입니다.
전체 UI 방향이 아직 불안정하면 우선 `frontend-design`을 상위 진입점으로 사용합니다.
기본 공개 workflow 진입점이 아니라 선택 UI/design bundle 구성요소로 취급합니다.

UI가 디자인 시스템에서 이탈했거나 특정 기능을 저장소의 기존 패턴으로 되돌려야 할 때 사용합니다.

## 준비

먼저 `frontend-design`을 로드합니다. 코드를 바꾸기 전에 기존 디자인 시스템을 확인합니다.
- 토큰과 CSS 변수
- 공용 컴포넌트
- 간격과 타이포 규칙
- 모션과 인터랙션 패턴

시스템이 불명확하면 추측하지 말고 질문합니다.

## 실행 규칙

- 새 일회성 컴포넌트보다 기존 프리미티브를 우선합니다.
- 가능한 한 하드코딩 값을 토큰으로 치환합니다.
- 타이포, 간격, 색상, 상태, 반응형 동작을 하우스 스타일에 맞춥니다.
- 정규화 과정에서도 접근성과 기능을 유지합니다.
- 마이그레이션 후 남은 중복 스타일과 불필요한 코드를 제거합니다.

## 금지 사항

- 단일 기능 안에서 새 디자인 시스템을 만들어내지 않기
- 토큰화되어야 할 값을 하드코딩하지 않기
- 시각적 일관성을 위해 접근성을 희생하지 않기
