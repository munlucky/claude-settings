---
name: audit
description: 접근성, 성능, 반응형, 테마/토큰 사용, 디자인 안티패턴 관점에서 UI 기술 품질을 점검하는 스킬입니다.
license: Apache 2.0. pbakaus/impeccable 기반으로 조정됨.
metadata:
  author: pbakaus
  source: https://github.com/pbakaus/impeccable
user-invocable: true
argument-hint: "[area]"
---

# Audit

UI 품질을 읽기 전용으로 점검할 때 사용합니다. 사용자가 수정을 명시적으로 요청하기 전에는 이 스킬 안에서 코드를 바꾸지 않습니다.

## 준비

먼저 `frontend-design`을 로드합니다. 디자인 컨텍스트가 없다면 `teach-impeccable`를 실행하거나 사용자에게 부족한 정보를 묻습니다.

## 점검 항목

대상을 다음 다섯 축으로 검토합니다.
1. 접근성
2. 성능
3. 테마와 토큰 사용
4. 반응형 동작
5. AI 느낌의 안티패턴

## 출력 형식

다음을 포함합니다.
- 각 항목별 0-4 점수
- 총점
- 안티패턴 판정을 가장 먼저 제시
- `P0`~`P3` 우선순위 이슈
- 가능하면 파일, 컴포넌트, 화면 단위 참조
- 일반적으로 `normalize`, `polish`로 이어지는 권장 후속 단계

## 품질 기준

- 사소한 지적보다 실제 사용자 영향에 집중합니다.
- 각 이슈가 왜 중요한지 설명합니다.
- 측정 가능한 기술 결함과 취향 영역을 구분합니다.
