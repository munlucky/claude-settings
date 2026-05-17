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
- completion gate, phase runner, state/projection writer, workflow enforcement, runtime parity, downstream sync logic 같은 meta-harness 개선

docs-only, read-only, 또는 test-first evidence가 실제로 불가능한 경우에만 우회할 수 있습니다.
우회할 때는 이유와 대체 verification path를 기록합니다.

meta-harness 작업에서 bypass는 예외입니다. MemoryGraph recall, manual diagnosis, source inspection은 무엇을 테스트할지 정하는 근거일 수 있지만 RED/GREEN executable evidence를 대체할 수 없습니다.

## 필수 Evidence

```yaml
tddEvidence:
  mode: tracer-bullet-red-green-refactor | bypassed
  cycles:
    - behavior: ""
      publicInterface: ""
      red:
        command: ""
        expectedFailure: ""
        evidence: ""
      green:
        command: ""
        evidence: ""
  refactorBoundary: ""
  bypassReason: ""
  alternateVerification: ""
```

## Workflow

1. public interface를 통해 가장 작은 관찰 가능한 동작을 식별합니다.
2. production code 변경 전에 해당 동작 하나에 대한 failing test를 정확히 하나 작성하거나 선택합니다.
3. test를 실행하고 예상 실패를 기록합니다.
4. 해당 test 하나를 통과시키는 데 필요한 최소 code만 구현합니다.
5. passing test와 관련 regression check를 실행합니다.
6. 이전 cycle이 green이 된 뒤에만 다음 RED -> GREEN cycle을 반복합니다.
7. 모든 active cycle test가 green인 뒤, 선언한 boundary 안에서만 refactor합니다.
8. cycle evidence를 `SPRINT_CONTRACT.md`와 `QA_REPORT.md`에 기록합니다.

## Meta-Harness Asset Rule

변경 대상이 하네스 자체라면:

- regression test 또는 fixture를 일회성 check가 아니라 durable asset으로 취급합니다.
- CLI output, exported decision function, state/projection file, package materialization, verifier/gate metadata처럼 public harness boundary를 실행하는 test를 우선합니다.
- incident가 다른 workspace에서 왔다면 fix를 이식하기 전에 가장 작은 재현 fixture를 가져오거나 가장 가까운 owner test에 동작을 고정합니다.
- 새 suite가 명확히 필요하지 않으면 가장 가까운 기존 suite에 test를 추가합니다.
- future failure가 어떤 회귀를 잡았는지 설명할 수 있도록 test name 또는 assertion message에 incident class를 기록합니다.
- MemoryGraph는 incident와 test path를 index할 수 있지만 enforcement source는 test file입니다.

## Tracer Bullet Rules

- 동작 test는 한 번에 하나만 작성합니다.
- test는 private method나 내부 구조가 아니라 관찰 가능한 동작을 검증합니다.
- 가능하면 public interface를 통과하는 integration-style test를 우선합니다.
- 모든 test를 먼저 작성한 뒤 모든 구현을 나중에 몰아서 하지 않습니다.
- 미래 test를 위한 speculative code를 추가하지 않습니다.
- active cycle이 red인 동안 refactor하지 않습니다.
- 좋은 test는 동작이 유지되는 한 내부 refactor 이후에도 살아남아야 합니다.

## Blocking Conditions

- 동작 변경 작업에 failing test 또는 명시적 bypass reason이 없습니다.
- 첫 구현 batch가 test evidence 전에 production code를 바꿉니다.
- bypass reason이 실제 불가능성이 아니라 편의성만 설명합니다.
- meta-harness 동작 변경이 durable executable regression 없이 MemoryGraph, manual log analysis, source inspection에만 의존합니다.
- 동작 변경 작업을 "모든 test 작성 후 모든 code 구현" 같은 horizontal batch로 계획합니다.
- public behavior interface가 있는데도 test가 implementation detail을 검증합니다.

## Output

```yaml
signals:
  tddReady: true
notes:
  - "tdd: red evidence captured"
  - "tdd: green evidence captured"
```
