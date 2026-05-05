# 현재 파악한 내용

## 현재 판단

이번 장시간 실행의 본질은 제품 구현 난이도보다 하네스 운영 문제에 가깝다. 구현량 자체도 작지는 않았지만, 12시간이 걸린 직접 원인은 runtime capability mismatch, verifier retry, closeout artifact schema drift, Docker daemon blocker를 초기에 분리하지 못한 점이다.

## Root Cause Summary

### 1. Capability preflight 부재

phase 시작 전에 `pnpm`, `corepack`, `python`, `pytest`, `bash`, `git`, `docker`, `codex runtime` 상태를 확정하지 않았다. 그 결과 구현이 끝난 뒤 검증 단계에서 환경 문제가 발견됐고, runner는 이를 구현 실패처럼 다루며 retry했다.

### 2. Failure fingerprint 정책 미흡

같은 환경 실패가 반복됐는데도 다른 attempt로 다시 실행됐다. 동일 fingerprint는 구현 재시도가 아니라 handoff 또는 host fallback을 유발해야 한다.

### 3. 검증 plane 분리 부족

실제 phase 구현 검증과 meta-harness 검증이 하나의 completion gate로 묶여 있었다. Phase 05와 Phase 06은 product-level 구현 검증이 통과했지만 meta verifier가 막혀 runner가 failed로 반환했다.

### 4. Fixture mutation

runtime parity smoke가 reference plan fixture를 실제로 `close/`로 이동시켰고, 그 경로가 `phase-status.yaml`까지 오염시켰다. smoke test는 원본 fixture를 건드리지 않고 temp copy에서 실행해야 한다.

### 5. Blocked artifact schema 불일치

blocked QA/HANDOFF도 verifier가 읽을 수 있어야 하는데, generator와 enforcement의 필수 field/enum이 달랐다. 그래서 blocked 상태를 문서화했는데도 workflow enforcement가 다시 실패했다.

### 6. Docker daemon dependency 미분리

`docker compose config`와 `docker compose up --wait`는 성격이 다르다. 전자는 static config validation이고, 후자는 외부 daemon-required integration smoke다. Docker daemon이 없으면 즉시 blocked handoff가 맞다.

## 개선 방향

### A. Phase capability preflight

새 preflight artifact를 phase 시작 전에 생성한다.

예상 출력:

```json
{
  "phase": 7,
  "capabilities": {
    "pnpm": { "status": "available", "command": "pnpm" },
    "corepackPnpm": { "status": "available", "command": "corepack pnpm" },
    "pythonPytest": { "status": "available", "command": "python -m pytest" },
    "bash": { "status": "blocked", "fingerprint": "bash_access_denied" },
    "git": { "status": "blocked_in_sandbox", "fallback": "host" },
    "dockerDaemon": { "status": "blocked", "fingerprint": "docker_daemon_unavailable" }
  },
  "decision": "resume_later_handoff",
  "reason": "daemon-required deployment smoke cannot run"
}
```

### B. Failure classifier

환경 failure는 아래처럼 canonical code로 정규화한다.

- `runtime_verifier_unavailable`
- `bash_access_denied`
- `git_eperm`
- `pnpm_not_on_path`
- `corepack_cache_eperm`
- `network_fetch_failed`
- `docker_daemon_unavailable`
- `fixture_mutation_detected`
- `artifact_schema_mismatch`

### C. Retry suppression

정책:

- implementation test failure: retry 가능
- artifact schema failure: 1회 normalizer 실행 후 재검증
- command resolver failure: equivalent command 1회 시도
- environment failure: 같은 fingerprint 반복 시 즉시 handoff
- external daemon unavailable: retry 없음

### D. Host fallback route

sandbox/codex runtime에서 막히는 명령은 host route를 공식화한다.

- requestedRuntime: 사용자가 요청한 runtime 또는 phase contract runtime
- effectiveRuntime: 실제 검증이 성공한 runtime
- fallbackReason: sandbox permission, PATH, daemon, shell launcher 등

이 세 필드를 verdict와 QA에 모두 남긴다.

### E. Runtime parity temp fixture

`verify-phase-runtime-parity.sh`는 원본 `.claude/docs/runtime-parity-reference-plan`을 직접 넘기지 않는다.

개선안:

1. temp dir 생성
2. reference fixture copy
3. smoke 실행
4. diff로 원본 fixture 변경이 없음을 검증
5. temp artifact만 보존 또는 삭제

### F. Artifact normalizer

QA/SCORECARD/HANDOFF를 closeout 전에 canonical schema로 정리한다.

필수 정규화:

- `Next path`: `clean_finish | retry_loop | resume_later_handoff`
- `Closeout reason`: `scope_complete | verification_failed | blocked | interrupted | context_limit | user_pause | deferred_verification`
- blocked QA에도 `Review Checkpoint`, `Workflow Execution`, `Failure Loop`, `Finish Readiness` 필수
- critical SCN evidence는 `SCN-ID | pass | evidence path` 형식을 포함

### G. Timing telemetry

phase별로 아래 값을 기록한다.

```yaml
timing:
  wallClockSeconds: 0
  runnerActiveSeconds: 0
  implementationSeconds: 0
  verificationSeconds: 0
  remediationSeconds: 0
  blockedSeconds: 0
  manualCloseoutSeconds: 0
  attempts: 0
  failureClassCounts: {}
```

이 정보는 `phase-status.yaml` 또는 별도 `meta-harness-trace`에 저장한다.

## 이번 실행에서 확인된 유효한 정책

- 단일 phase 완료를 전체 plan 완료로 보지 않는 정책은 맞다.
- SPRINT_CONTRACT, QA_REPORT, SCORECARD, HANDOFF, phase-status를 evidence chain으로 쓰는 구조는 유효하다.
- critical SCN evidence를 요구하는 방향은 맞다.
- source plan conformance를 closeout gate로 쓰는 것도 맞다.

문제는 gate의 엄격함 자체가 아니라 runtime capability와 artifact schema를 먼저 안정화하지 못한 점이다.

## 권장 작업 순서

1. `phase-capability-preflight` 강화
2. failure fingerprint와 retry suppression 구현
3. runtime parity temp fixture 전환
4. blocked artifact normalizer 구현
5. host fallback verdict schema 정리
6. Docker daemon-required smoke 분리
7. timing telemetry와 meta-harness trace 생성
8. replay-lens Phase 07 blocker를 regression fixture로 추가

## Regression Fixtures

이번 사건은 다음 fixture로 재현 가능해야 한다.

| Fixture | 기대 동작 |
|---|---|
| bash unavailable | bash verifier를 반복하지 않고 blocked handoff |
| git EPERM | worktree self-test를 반복하지 않고 host fallback 또는 blocked |
| pnpm missing but corepack available | approved equivalent로 검증 성공 |
| Docker daemon missing | `docker compose config`만 통과, `up --wait`는 immediate handoff |
| runtime parity smoke | 원본 fixture와 phase-status 변경 없음 |
| blocked QA artifact | workflow-enforcement 통과 |
| SCN evidence format | verifier가 critical scenarios를 정확히 인식 |

## Phase 06 Decision Note

- final audit는 external blocker가 있으면 partial-mode note를 남길 수 있지만, clean finish로 승격해서는 안 된다.
- Docker daemon이 없는 경우 `docker compose config`만의 성공은 pass가 아니라 blocker-aware partial evidence다.
- ignored verification evidence는 closeout ledger에서 이름이 보여야 하며, 문서에서 숨기면 안 된다.

## Non-goals

- replay-lens 제품 구현을 claude-settings로 옮기지 않는다.
- completion gate를 완화하지 않는다.
- Docker daemon이 없는 상태에서 deployment smoke를 fake pass로 처리하지 않는다.
- public sharing, billing, production GPU scaling 같은 제품 scope를 하네스 개선에 섞지 않는다.

## 다음 액션

이 문서를 기준으로 claude-settings에서 별도 하네스 개선 plan을 만든다. 구현은 `replay-lens`의 product phase와 분리하고, 패치 대상은 `.claude/scripts`, `.claude/docs/guidelines`, verifier fixtures, artifact generators에 한정한다.
