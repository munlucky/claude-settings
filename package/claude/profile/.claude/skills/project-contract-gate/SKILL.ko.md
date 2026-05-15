---
name: project-contract-gate
description: downstream 프로젝트의 PROJECT.md 최소 계약을 확인하고, 부족하면 project-md-refresh로 연결합니다.
---

# Project Contract Gate

## 역할
downstream 구현 흐름이 최소한의 `.claude/PROJECT.md` 없이 코드 작업으로 진입하지 못하게 막습니다.

## 사용 시점
- `executionPlane == product_project`
- 계획 수립이나 구현 단계 전에 사용

## 입력
- `analysisContext.signals.executionPlane`
- `analysisContext.signals.projectContractReady`
- 존재하는 경우 `.claude/PROJECT.md`

## 게이트 로직
1. `executionPlane != product_project`이면 통과 메모만 남기고 종료합니다.
2. `projectContractReady == true`이면 통과합니다.
3. 그렇지 않으면:
   - `project-md-refresh` 실행을 권장하거나 자동 주입합니다.
   - phase를 planning에 유지합니다.
   - 어떤 최소 섹션이 부족한지 기록합니다.

## 최소 계약 영역
- 프로젝트 개요
- 명령어
- 테스트 규칙
- 구조/패턴
- Git 워크플로우
- 핵심 규칙 / 경계

## 출력 예시
```yaml
notes:
  - "project-contract-gate: blocked -> run project-md-refresh"
missingInfo:
  - category: project-contract
    priority: HIGH
    question: "계속하기 전에 `.claude/PROJECT.md`를 보강하세요."
decisions:
  recommendedAgents:
    - project-md-refresh
```

## 규칙
- 이 게이트는 정책 검사만 수행합니다.
- 파일을 직접 수정하지 않습니다.
- 생성 로직은 `project-md-refresh`에 위임합니다.
