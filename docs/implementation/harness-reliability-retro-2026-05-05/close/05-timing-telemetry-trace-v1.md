# Phase 05: Timing Telemetry and Diagnosis Trace (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HR-021 | ISSUE_REGISTER | wall-clock vs active time 분리 | phase timing schema 추가 |
| HR-022 | ISSUE_REGISTER | retry time attribution | implementation/verification/remediation/blocked split |
| HR-023 | ISSUE_REGISTER | host manual closeout representation | controller-side manualCloseoutSeconds |
| HR-024 | ISSUE_REGISTER | oversized raw logs | diagnosis trace bundle |
| HR-025 | ISSUE_REGISTER | issue evidence spread | diagnosis manifest truth source |
| HR-032 | ISSUE_REGISTER | count display ambiguity | total/planned/remaining counters |
| HR-035 | ISSUE_REGISTER | duplicate verification | reusable verification result import |
| HR-036 | ISSUE_REGISTER | stale verdict coexistence | supersedes/supersededBy enforcement |

## 목표
- 사용자가 보는 wall-clock과 runner가 기록하는 active time의 차이를 artifact로 설명 가능하게 한다.
- retry/remediation/blocked/manual closeout 시간을 분리해 병목을 로그 grep 없이 파악한다.
- verdict, QA, SCORECARD, HANDOFF, phase-status, workflow log를 diagnosis manifest로 연결한다.

## 기대 결과
- `phase-status.yaml` 또는 meta-harness trace manifest에 timing split이 기록된다.
- stale/blocked/passed verdict가 공존할 때 active verdict 선택 기준이 명확하다.
- raw log가 커져도 `meta-harness-trace` diagnosis bundle에서 핵심 failure/fallback/timing을 읽을 수 있다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4-timing-trace"
  dependsOn:
    - "01-capability-fingerprint-foundation-v1"
    - "04-runtime-resolver-and-dependency-gates-v1"
  conflictsWith:
    - "04-runtime-resolver-and-dependency-gates-v1"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/meta-harness-trace.mjs"
    - ".claude/scripts/verification-verdict-state.mjs"
    - ".claude/docs/guidelines/meta-harness-trace.md"
  readOnlyPaths:
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/lib/command-resolver.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_runner_patch"
```

## 범위
- 포함:
  - timing schema and phase-status persistence
  - meta-harness trace manifest enrichment
  - verification result import/supersession semantics
  - total/planned/completed/remaining counter clarity
- 제외:
  - classifier canonical code 변경
  - artifact normalizer schema 변경
  - Docker gate implementation

## 선행조건과 입력
- Phase 01 failure classifier
- Phase 04 runtime resolver and verdict context
- Existing `.claude/scripts/meta-harness-trace.mjs`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P05-1 | timing schema 추가 | 1) phase start/end 기록 2) runnerActive/verification/remediation/blocked/manual split 3) phase-status에 저장 | timing object가 phase-status 또는 trace에 존재 |
| P05-2 | diagnosis manifest 확장 | 1) QA/HANDOFF/SCORECARD/verdict/status/log 연결 2) failureClassCounts 집계 3) fallbackReason 집계 | manifest 하나로 truth source 추적 가능 |
| P05-3 | verdict supersession enforcement | 1) active/stale/superseded 선택 기준 강화 2) reused verification result import 기록 | stale failed verdict가 final passed verdict를 덮지 않음 |
| P05-4 | count display 정리 | 1) planned/completed/blocked/pending/remaining 분리 2) close/ archive 이후에도 같은 값 유지 | status display ambiguity 제거 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P05-1 | 없음 | `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/agent-loop-phase-state.mjs` | timing fixture | `node --check .claude/scripts/agent-loop-phase-state.mjs` | exit code 0 |
| P05-2 | 없음 | `.claude/scripts/meta-harness-trace.mjs` | trace fixture | `node --check .claude/scripts/meta-harness-trace.mjs` | exit code 0 |
| P05-3 | 없음 | `.claude/scripts/verification-verdict-state.mjs` | existing self-test | `node .claude/scripts/verification-verdict-state.mjs self-test` | self-test passed |
| P05-4 | 없음 | `.claude/scripts/agent-loop-phase-state.mjs` | status fixture | `node --check .claude/scripts/agent-loop-phase-state.mjs` | exit code 0 |

## Critical Product Scenarios
| SCN ID | 사용자 기대 | 증명 명령 | Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-HR-010 | 12h wall-clock과 4h40m runner active 차이를 artifact가 설명한다 | `node .claude/scripts/meta-harness-trace.mjs capture --trace-id sample --phase-status <path> --analysis <path> --qa-report <path> --handoff <path> --scorecard <path>` | `diagnosis.json`에 timing split 존재 | `.claude/logs/meta-harness-trace/sample/diagnosis.json` |
| SCN-HR-011 | stale verdict가 active verdict를 오염시키지 않는다 | `node .claude/scripts/verification-verdict-state.mjs self-test` | supersession fixture passed | `.claude/logs/agent-loop/verdict-supersession-self-test.log` |

## Blockers And Review
- Blocker condition: timing 기록이 runner behavior를 느리게 만들거나 raw log full copy를 강제하면 중단한다.
- First review checkpoint: timing schema가 `phase-status.yaml`와 trace manifest 중 어디에 authoritative로 들어가는지 확정한다.
- Re-review trigger: verdict active selection logic 변경 시 재리뷰한다.
- Verification evidence path: `.claude/logs/meta-harness-trace/*/diagnosis.json`, `.claude/logs/agent-loop/verdict-supersession-self-test.log`

## 검증 계획
- [ ] Syntax: `node --check .claude/scripts/meta-harness-trace.mjs`
- [ ] Syntax: `node --check .claude/scripts/agent-loop-phase-runner.mjs`
- [ ] Verdict: `node .claude/scripts/verification-verdict-state.mjs self-test`
- [ ] Trace smoke: sample fixture capture produces `manifest.json`, `diagnosis.json`, `diagnosis.md`

## 완료 표시용 증거
- meta-harness trace sample directory
- verdict supersession self-test output
- phase-status timing object fixture

## 산출물
- timing split schema
- diagnosis manifest
- verdict supersession/reuse policy
- clearer phase counters

## Phase 완료 체크리스트
- [ ] wall-clock/runnerActive/verification/remediation/blocked/manualCloseout timing이 분리됨
- [ ] diagnosis manifest가 scattered evidence를 연결함
- [ ] stale verdict 공존 시 active verdict 선택이 deterministic함
- [ ] phase count display가 planned/completed/remaining을 분리함

## 핸드오프 메모
- Phase 06은 replay-lens retro 수치를 sample fixture로 삼아 timing diagnosis regression을 추가한다.
