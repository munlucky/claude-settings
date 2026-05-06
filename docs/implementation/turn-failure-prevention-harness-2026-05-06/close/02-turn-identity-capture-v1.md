# Phase 02: Turn Identity Capture (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| TFP-003 | Downloaded plan Turn Identity | 기존 `turn_id` 필드를 실제 runner capture에 사용 | capture session과 phase runner에 turn lifecycle 추가 |
| TFP-010 | Downloaded plan Test Plan | action, judge_result, memory_read가 같은 `turn_id`로 연결 | harness capture test와 runner capture path 검증 |

## 목표
- AWTL event envelope의 기존 `turn_id`를 실제 phase attempt 단위로 채운다.
- worker prompt action, completion judge, file reconciliation, memory read가 같은 logical turn에 묶이게 한다.

## 기대 결과
- `turn-<phase>-<attempt>-<seq>-<shortuuid>` 형식의 turn id가 capture event에 기록된다.
- retry/remediation attempt는 새 `turn_id`를 갖고 같은 run/attempt context에 연결된다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn:
    - "01-trace-hygiene-trace-root-guard"
  conflictsWith:
    - "03-failed-turn-case-builder"
    - "04-next-run-recall-brief"
  ownedPaths:
    - ".claude/scripts/lib/awtl-harness-capture.mjs"
    - ".claude/scripts/lib/awtl-harness-capture.test.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
  readOnlyPaths:
    - ".claude/schemas/awtl-event-v1.schema.json"
    - ".claude/scripts/lib/awtl-trace-sink.mjs"
  sharedMutablePaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness_patch"
```

## 범위
- 포함:
  - `createPhaseHarnessCaptureSession`에 turn id generator와 current turn state 추가
  - capture record APIs에 optional `turnId` 전달
  - phase runner worker prompt/judge/file reconciliation capture에 turn id 적용
- 제외:
  - 새로운 trace event type 추가
  - failure case 저장
  - prompt brief injection

## 선행조건과 입력
- Phase 01 완료.
- `awtl-event-v1.schema.json`의 optional `turn_id` 필드는 그대로 사용한다.

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P02-1 | turn id generator 추가 | 1) `beginTurn(details)` 구현 2) phase/attempt/seq/shortuuid 형식 고정 3) currentTurnId state 관리 | deterministic format assertion pass |
| P02-2 | capture APIs에 turnId 전파 | 1) `emit` override에 `turnId` 추가 2) record APIs가 envelope `turn_id`에 반영 | action/judge/memory/file events에 turn id 존재 |
| P02-3 | phase runner capture 연결 | 1) attempt 시작 뒤 turn 발급 2) worker prompt action과 completion judge에 같은 turn id 전달 3) retry loop에서 새 turn 발급 | runner-generated trace에서 turn grouping 확인 |
| P02-4 | 회귀 테스트 보강 | 1) `awtl-harness-capture.test.mjs`에 same-turn lifecycle 테스트 추가 2) retry/remediation separate turn 테스트 추가 | `node --test` pass |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P02-1 | none | `.claude/scripts/lib/awtl-harness-capture.mjs` | `.claude/scripts/lib/awtl-harness-capture.test.mjs` | `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs` | turn id format assertion pass |
| P02-2 | none | `.claude/scripts/lib/awtl-harness-capture.mjs` | `.claude/scripts/lib/awtl-harness-capture.test.mjs` | `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs` | action/judge/memory/file events share turn id |
| P02-3 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | existing runner smoke | `node --check .claude/scripts/agent-loop-phase-runner.mjs` | syntax pass |
| P02-4 | none | none | `.claude/scripts/lib/awtl-harness-capture.test.mjs` | `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs .claude/scripts/lib/awtl-harness-capture.test.mjs` | trace + capture tests pass |

## Blockers And Review
- Blocker condition: runner capture warning이 main task verdict를 fail/pass로 오염시키면 중단한다.
- First review checkpoint: `turn_id`가 optional schema field라 schema migration 없이 동작하는지 확인한다.
- Re-review trigger: phase runner attempt/retry structure가 바뀌면 turn lifecycle을 다시 검토한다.
- Verification evidence path: `docs/implementation/turn-failure-prevention-harness-2026-05-06/execution/02-turn-identity-capture-v1/QA_REPORT.md`

## 검증 계획
- [x] capture unit: `node --test .claude/scripts/lib/awtl-harness-capture.test.mjs`
- [x] trace regression: `node --test .claude/scripts/lib/awtl-trace-sink.test.mjs`
- [x] runner syntax: `node --check .claude/scripts/agent-loop-phase-runner.mjs`
- [x] policy: `bash .claude/scripts/verify-code-policy.sh`

## 완료 표시용 증거
- QA report에 generated events의 same-turn grouping sample을 기록한다.
- Scorecard에 TFP-003, TFP-010 pass를 기록한다.

## 산출물
- actual turn-aware AWTL capture path

## Phase 완료 체크리스트
- [x] `beginTurn`과 turn id format이 구현됨
- [x] action/judge/memory/file reconciliation이 같은 turn id로 연결됨
- [x] retry/remediation turn 분리가 검증됨
- [x] 검증 체크를 통과함

## Critical Product Scenarios
| Scenario ID | Flow | Required Evidence |
|---|---|---|
| SCN-TFP-P02-TURN-ID | Same attempt events share a turn id and retry/remediation starts a different turn id. | QA report row or turn grouping evidence marked pass. |

## 핸드오프 메모
- Phase 03은 `failure_turn_id`를 attribution/candidate에 붙인다. Phase 02가 없다면 failed turn case는 event id 수준으로만 동작해 목표를 만족하지 못한다.
