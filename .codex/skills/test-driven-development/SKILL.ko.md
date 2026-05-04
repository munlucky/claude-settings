---
name: test-driven-development
description: 동작 변경 구현 전에 red-green-refactor evidence를 요구한다.
surfaceStatus: internal_stage_owner
---

# Test-Driven Development

## 역할

`implementation-runner` 전에 동작 변경 작업에 test-first 규율을 적용합니다.

이 스킬은 내부 Execute-stage owner입니다.
사용자는 보통 이 스킬이 아니라 `moonshot-orchestrator` 또는 `moonshot-phase-runner`로 진입합니다.

## 사용 시점

사용 대상:
- 새 동작
- 버그 수정
- 동작이 바뀔 수 있는 리팩터링
- 관찰 가능한 결과가 있는 API, UI, workflow 변경

docs-only, read-only, 또는 test-first evidence가 실제로 불가능한 경우에만 우회할 수 있습니다.
우회할 때는 이유와 대체 verification path를 기록합니다.

## 필수 Evidence

```yaml
tddEvidence:
  mode: red-green-refactor | bypassed
  failingTest:
    command: ""
    expectedFailure: ""
    evidence: ""
  passingTest:
    command: ""
    evidence: ""
  refactorBoundary: ""
  bypassReason: ""
  alternateVerification: ""
```

## Workflow

1. 가장 작은 관찰 가능한 동작을 식별합니다.
2. production code 변경 전에 failing test를 작성하거나 선택합니다.
3. test를 실행하고 예상 실패를 기록합니다.
4. 통과에 필요한 최소 code만 구현합니다.
5. passing test와 관련 regression check를 실행합니다.
6. 선언한 boundary 안에서만 refactor합니다.
7. evidence를 `SPRINT_CONTRACT.md`와 `QA_REPORT.md`에 기록합니다.

## Blocking Conditions

- 동작 변경 작업에 failing test 또는 명시적 bypass reason이 없습니다.
- 첫 구현 batch가 test evidence 전에 production code를 바꿉니다.
- bypass reason이 실제 불가능성이 아니라 편의성만 설명합니다.

## Output

```yaml
signals:
  tddReady: true
notes:
  - "tdd: red evidence captured"
  - "tdd: green evidence captured"
```
