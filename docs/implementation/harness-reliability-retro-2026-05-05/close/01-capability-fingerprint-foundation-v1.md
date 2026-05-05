# Phase 01: Capability and Fingerprint Foundation (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HR-001 | ISSUE_REGISTER | phase 시작 전 capability matrix | `phase-capability-preflight.mjs` 출력 schema 확장 |
| HR-002 | ISSUE_REGISTER | environment failure retry 억제 | canonical fingerprint classifier 추가 |
| HR-015 | ISSUE_REGISTER | git EPERM preflight | git capability probe와 host fallback hint |
| HR-016 | ISSUE_REGISTER | bash access denied preflight | bash failure를 no-retry blocker로 분류 |
| HR-019 | ISSUE_REGISTER | sameFailureClassCount >= 2 정책 | runner retry decision 입력으로 fingerprint count 제공 |
| HR-033 | ISSUE_REGISTER | network fetch failure 구분 | network blocker code 추가 |

## 목표
- phase 시작 전에 command/runtime capability를 JSON artifact로 확정한다.
- 반복 가능한 failure를 canonical code와 fingerprint로 정규화한다.
- environment/external blocker는 구현 재시도가 아니라 handoff 또는 fallback 판단으로 라우팅한다.

## 기대 결과
- `node .claude/scripts/phase-capability-preflight.mjs --json`가 `capabilities`, `decision`, `reason`, `failureClassCounts`를 포함한다.
- `bash_access_denied`, `git_eperm`, `network_fetch_failed`, `docker_daemon_unavailable` 같은 failure code가 안정적으로 동일 fingerprint를 만든다.
- 같은 phase에서 동일 environment fingerprint가 2회 이상 반복되면 runner가 auto-fix loop로 들어가지 않는다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1-foundation"
  dependsOn: []
  conflictsWith:
    - "04-runtime-resolver-and-dependency-gates-v1"
    - "05-timing-telemetry-trace-v1"
  ownedPaths:
    - ".claude/scripts/phase-capability-preflight.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/lib/failure-classifier.test.mjs"
  readOnlyPaths:
    - "docs/implementation/harness-reliability-retro-2026-05-05/ISSUE_REGISTER.md"
    - ".claude/verification.contract.yaml"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_runner_patch"
```

## 범위
- 포함:
  - capability matrix schema 확장
  - canonical failure code와 stable fingerprint library
  - runner retry decision에 same-fingerprint signal 연결
  - blocker와 fallback hint를 preflight artifact에 기록
- 제외:
  - artifact 문서 schema normalizer 구현
  - Docker daemon smoke 실행 자체
  - timing telemetry persistence

## 선행조건과 입력
- 필수 문서:
  - `docs/implementation/harness-reliability-retro-2026-05-05/00-master-plan-v1.md`
  - `docs/implementation/harness-reliability-retro-2026-05-05/ISSUE_REGISTER.md`
- 필수 코드:
  - `.claude/scripts/phase-capability-preflight.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/scripts/verification-verdict-state.mjs`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P01-1 | failure classifier library 추가 | 1) failure message/code 입력을 canonical code로 normalize 2) stable fingerprint 생성 3) self-test 작성 | 동일 입력 변형이 같은 fingerprint를 반환 |
| P01-2 | capability preflight schema 확장 | 1) pnpm/corepack/python/pytest/bash/git/docker/codex probes 정리 2) blocker/fallback/decision 필드 추가 3) JSON artifact 유지 | preflight output이 expected schema를 포함 |
| P01-3 | retry suppression signal 연결 | 1) runner가 finalStopReason과 fingerprint를 읽음 2) sameFailureClassCount >= 2면 retry 금지 3) decision log에 stop reason 기록 | environment blocker 반복 시 `resume_later_handoff`로 멈춤 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P01-1 | `.claude/scripts/lib/failure-classifier.mjs` | 없음 | `.claude/scripts/lib/failure-classifier.test.mjs` | `node .claude/scripts/lib/failure-classifier.test.mjs` | `failure-classifier self-test passed` |
| P01-2 | 없음 | `.claude/scripts/phase-capability-preflight.mjs` | `.claude/scripts/lib/failure-classifier.test.mjs` | `node .claude/scripts/phase-capability-preflight.mjs --json` | JSON에 `capabilities`, `decision`, `artifactPath` 존재 |
| P01-3 | 없음 | `.claude/scripts/agent-loop-phase-runner.mjs` | `.claude/scripts/lib/failure-classifier.test.mjs` | `node --check .claude/scripts/agent-loop-phase-runner.mjs` | exit code 0 |

## Critical Product Scenarios
| SCN ID | 사용자 기대 | 증명 명령 | Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-HR-001 | phase 시작 전에 환경 blocker가 보인다 | `node .claude/scripts/phase-capability-preflight.mjs --json` | `decision`이 `continue`, `host_fallback`, `resume_later_handoff` 중 하나 | `.claude/logs/agent-loop/capabilities-*.json` |
| SCN-HR-002 | 같은 bash/git/network 실패를 반복 실행하지 않는다 | `node .claude/scripts/lib/failure-classifier.test.mjs` | 동일 fixture가 같은 fingerprint | `.claude/logs/agent-loop/failure-classifier-self-test.log` |

## Blockers And Review
- Blocker condition: classifier가 implementation assertion failure와 environment blocker를 구분하지 못하면 중단한다.
- First review checkpoint: `phase-capability-preflight.mjs --json` schema diff 확인 후 runner 연결 전 리뷰한다.
- Re-review trigger: `agent-loop-phase-runner.mjs` retry decision branch 변경 시 재리뷰한다.
- Verification evidence path: `.claude/logs/agent-loop/capabilities-*.json`, `.claude/logs/agent-loop/failure-classifier-self-test.log`

## 검증 계획
- [ ] Syntax: `node --check .claude/scripts/phase-capability-preflight.mjs`
- [ ] Syntax: `node --check .claude/scripts/agent-loop-phase-runner.mjs`
- [ ] Unit: `node .claude/scripts/lib/failure-classifier.test.mjs`
- [ ] Runtime smoke: `node .claude/scripts/phase-capability-preflight.mjs --json`

## 완료 표시용 증거
- `.claude/logs/agent-loop/capabilities-*.json`
- `.claude/logs/agent-loop/failure-classifier-self-test.log`
- `git diff -- .claude/scripts/phase-capability-preflight.mjs .claude/scripts/agent-loop-phase-runner.mjs .claude/scripts/lib/failure-classifier.mjs`

## 산출물
- canonical failure classifier
- enriched phase capability preflight artifact
- retry suppression decision signal

## Phase 완료 체크리스트
- [ ] HR-001, HR-002, HR-015, HR-016, HR-019, HR-033이 concrete code/test로 반영됨
- [ ] preflight JSON artifact가 phase 시작 전에 생성 가능함
- [ ] 동일 environment fingerprint 반복이 auto-fix retry로 가지 않음

## 핸드오프 메모
- Phase 04는 이 phase의 classifier와 capability decision을 package manager, Docker, runtime fallback 정책에 재사용한다.
