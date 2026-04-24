---
name: task-slicer
description: 실행 계획을 독립 실행 가능한 vertical-slice task 문서들로 분해합니다.
---

# Task Slicer

## 역할

`PLAN.md`를 구현 워크플로우에 바로 넘길 수 있는 `tasks/*.md` 파일로 분해합니다.

이 스킬은 단순 포맷 정리가 아닙니다.
실행 단위 분해 단계입니다.

## 입력

- `PLAN.md`
- `SPEC.md`
- `SOLUTION.md`
- 관련 assumptions와 blockers

## 출력

다음 경로 아래 vertical slice별 task 파일을 작성합니다.
- `{tasksRoot}/{feature-name}/product/tasks/`

각 task는 `task.template.md`를 따라야 합니다.

## Task별 필수 필드

- Goal
- Input
- Output
- Scope
- Dependencies
- Parallelization
- Done criteria
- Verification
- Rollback 또는 risk
- 생성/수정/테스트할 정확한 파일
- 실행할 정확한 명령
- 예상 fail/pass signal
- Blocker condition
- Review checkpoint
- Verification evidence path

## 분해 규칙

우선할 것:
- 사용자에게 보이는 end-to-end 증가분
- 필요 시 여러 레이어를 관통하되 얇은 slice
- 독립 소유와 독립 검증이 가능한 작업

피할 것:
- 사용자 결과가 없는 순수 레이어 분리
- 범위가 지나치게 큰 우산형 task
- 다른 slice의 숨은 맥락 없이는 실행 불가능한 task

## 병렬 그룹 규칙

필요하면 단순한 병렬 그룹 라벨을 부여합니다.
- `G1`, `G2`, `G3`

다음 조건일 때만 병렬 그룹으로 묶습니다.
- 같은 계약을 동시에 변경하지 않음
- 같은 미완성 산출물에 의존하지 않음
- 검증을 독립적으로 수행할 수 있음

## 핸드오프 품질 기준

좋은 task 파일은 구현 에이전트가 아래 상태로 바로 시작할 수 있어야 합니다.
- 추가 계획 수립이 필요 없음
- 스코프를 임의로 만들 필요 없음
- 완료 판정 기준이 명확함
- 정확한 file/command target이 있음
- 명시적인 fail/pass evidence expectation이 있음

## 참고

- `.claude/docs/guidelines/product-definition-workflow.md`
- `.claude/templates/product-definition/task.template.md`
