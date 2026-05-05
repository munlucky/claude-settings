# 이슈 문서

## 분류 기준

이번 실행에서 나온 이슈를 하네스 개선 대상으로 전부 기록한다. 우선순위는 별도 구현 계획에서 다시 정하되, 여기서는 누락 없이 수집하는 것을 목표로 한다.

## Issue Register

| ID | 분류 | 증상 | 영향 | 개선 대상 |
|---|---|---|---|---|
| HR-001 | capability preflight missing | phase 시작 뒤에야 `pnpm`, `bash`, `git`, `docker`, `codex runtime` 부재가 드러남 | 구현 후 검증 단계에서 장시간 retry 발생 | phase 시작 전 capability matrix |
| HR-002 | environment failure retry | 같은 `runtime_verifier_unavailable`, `bash_access_denied`, `git EPERM`, `docker_daemon_unavailable`가 반복됨 | 같은 실패를 3-5회 반복 | failure fingerprint와 retry suppression |
| HR-003 | execution plane mismatch | sandbox/codex runtime에서는 실패하고 host runtime에서는 통과 | false blocked, 중복 검증 | official host fallback route |
| HR-004 | implementation/meta verifier coupling | phase-specific tests 통과 후 meta-harness verifier 실패가 phase 실패로 처리됨 | 구현 완료 상태가 보존되지 않음 | implementation verification과 harness verification 분리 |
| HR-005 | runtime parity fixture side effect | `verify-phase-runtime-parity`가 reference phase doc를 `close/`로 이동 | fixture와 `phase-status.yaml` 오염 | temp copy 기반 parity smoke |
| HR-006 | archivedPhaseDoc pollution | runtime parity fixture 경로가 Phase 01 `archivedPhaseDoc`에 들어감 | closeout verifier가 엉뚱한 archive를 검사 | archive sync 대상 제한 |
| HR-007 | Windows path handling bug | `new URL(import.meta.url).pathname` 사용으로 Windows path가 깨짐 | verifier runtime preflight 실패 | `fileURLToPath(import.meta.url)` 고정 |
| HR-008 | Korean heading parsing gap | Korean phase docs의 `목표`, `범위`, `상세 작업`, `정확한 실행 대상`, `Phase 완료 체크리스트`를 verifier가 충분히 인식하지 못함 | plan snapshot/closeout false fail | heading alias table canonicalization |
| HR-009 | QA schema drift | QA generator와 workflow-enforcement가 요구하는 필드/enum이 다름 | clean 또는 blocked 문서가 다시 violation 발생 | shared schema or artifact normalizer |
| HR-010 | blocked state enum mismatch | `Next path: blocked`, `stop_and_handoff` 등이 verifier 허용값과 불일치 | blocked 문서도 verifier 실패 | blocked template canonicalization |
| HR-011 | verdict generation brittle | runner는 `write-verification-verdict.py`를 요구하지만 runtime Python/tooling이 막히면 verdict 갱신 실패 | hand-authored verdict나 stale verdict 유혹 | verdict writer runtime wrapper |
| HR-012 | pnpm discovery gap | `pnpm` direct command는 안 되고 `corepack pnpm` 또는 host `pnpm`은 됨 | package verification false blocked | package manager resolver |
| HR-013 | corepack cache/network issue | corepack이 user cache EPERM, registry fetch fail을 냄 | install 검증 장기 지연 | repo-local cache plus offline detection |
| HR-014 | Python binding issue | local Python/pytest가 runtime별로 달라짐 | Python tests false blocked | project Python shim or resolver contract |
| HR-015 | git EPERM in sandbox | `phase-worktree-coordinator.mjs self-test`가 `spawnSync git EPERM` | worktree self-test false blocked | git capability preflight and host route |
| HR-016 | bash access denied | Git Bash/WSL launch가 access denied 또는 signal-pipe error | harness shell verifier false blocked | bash capability preflight and no-retry blocker |
| HR-017 | Docker daemon hard blocker | `docker compose config`는 통과하지만 `up --wait`는 Docker Desktop pipe 없음 | Phase 07 clean finish 불가 | static config와 daemon smoke 분리 |
| HR-018 | Docker retry waste | daemon 없는 상태에서 deployment smoke를 반복 | 시간 낭비 | `docker info` preflight and immediate handoff |
| HR-019 | repeated remediation without tactic change | 같은 failureClass가 반복돼도 runner가 remediation loop 계속 | 불필요한 30-50분 추가 | sameFailureClassCount >= 2 정책 강제 |
| HR-020 | phase active/close archive ambiguity | root phase doc와 `close/` phase doc가 섞여 active candidate 계산 혼선 | 다음 phase 탐색/closeout drift | phase-status.yaml authoritative traversal |
| HR-021 | wall-clock accounting missing | `goalRuntime.timeUsedSeconds`는 runner active만 보여줌 | 사용자가 본 12h와 하네스 기록 4h40m 차이 설명 어려움 | wallClock/active/retry/blocked/manual split |
| HR-022 | retry time attribution missing | implementation, verification, remediation, blocked wait 시간이 분리되지 않음 | 병목 추정이 로그 의존 | phase timing telemetry |
| HR-023 | host manual closeout not represented | parent session이 host 검증/문서 closeout을 한 시간이 goalRuntime에 반영되지 않음 | 실제 운영비용 과소계상 | controller-side manualCloseoutSeconds |
| HR-024 | oversized raw logs | phase log가 수 MB로 커지고 핵심 원인 추출이 어려움 | 사후 분석 비용 증가 | meta-harness trace bundle |
| HR-025 | issue evidence spread | QA, SCORECARD, HANDOFF, verdict, phase-status, raw log에 사실이 분산 | truth source 혼선 | diagnosis manifest |
| HR-026 | product phase와 harness 개선 혼재 | downstream project 코드 수정 중 하네스 버그를 같이 고침 | 책임 경계 불명확 | claude-settings로 하네스 개선 이관 |
| HR-027 | blocked closeout quality | blocked 상태의 QA/HANDOFF가 verifier-required fields를 누락 | blocker 기록 자체가 violation | blocked artifact generator |
| HR-028 | critical scenario evidence format sensitivity | SCN evidence가 문서에 있어도 verifier가 특정 형식만 인식 | false missing evidence | scenario evidence parser와 template 통합 |
| HR-029 | exact command vs equivalent command ambiguity | `pnpm` exact command가 안 될 때 `corepack pnpm`을 equivalent로 볼지 불명확 | blocked 처리와 pass 처리 일관성 없음 | approved equivalent command policy |
| HR-030 | runtime target confusion | verification runtime target `codex`인데 host에서 실제 검증 통과 | verdict runtimeContext 해석 혼선 | requested/effective runtime split 강화 |
| HR-031 | Docker health as hard gate without availability probe | Phase 07 plan이 daemon-required smoke를 hard gate로 둠 | 환경 미준비 시 전체 plan 중단 | dependency-aware phase gate |
| HR-032 | phase runner count display ambiguity | archived completed docs 이후 total phases 표시가 remaining count처럼 보임 | 운영자 혼란 | total/planned/remaining counters 분리 |
| HR-033 | network-restricted corepack behavior | package fetch 실패가 install failure처럼 보임 | 환경과 dependency 문제 구분 어려움 | network blocker classifier |
| HR-034 | source docs gap final phase dependency | Phase 08는 Phase 07 완료에 의존하므로 Docker blocker 하나가 final gap analysis까지 막음 | product gap analysis 지연 | final audit partial-mode option 검토 |
| HR-035 | validation command duplication | runner 내부 검증 후 parent가 같은 검증을 다시 수행 | 시간 증가 | reusable verification result import |
| HR-036 | stale verdict coexistence | failed/blocked verdict와 final passed verdict가 공존 | evidence selection 혼선 | supersedes/supersededBy enforcement |
| HR-037 | ignored artifact handling | `.claude/verification-verdict-*` 같은 evidence가 ignore될 수 있음 | closeout evidence 누락 위험 | evidence include policy |
| HR-038 | docs structural audit after external write | `claude-settings` 하네스 문서 추가 후 knowledge audit 필요 | docs TOC drift 가능 | doc-auto-sync follow-up |

## 중복 failure class

이번 실행에서 반복된 주요 failure class는 아래와 같다.

- `runtime_verifier_unavailable`
- `verifier_unavailable`
- `bash_access_denied`
- `git EPERM`
- `pnpm-not-installed`
- `corepack EPERM`
- `network fetch failed`
- `docker_daemon_unavailable`
- `runtime parity fixture mutation`
- `artifact schema mismatch`

## 하드 블로커와 소프트 블로커 구분

| 유형 | 예시 | 처리 원칙 |
|---|---|---|
| hard external blocker | Docker daemon unavailable | 즉시 `resume_later_handoff`, retry 금지 |
| runtime capability blocker | bash access denied, git EPERM | host fallback 가능 여부 판단 후 1회만 재시도 |
| command resolver blocker | pnpm not on PATH | approved equivalent command resolver 사용 |
| artifact schema blocker | QA field missing | generator/normalizer로 자동 보정 |
| implementation failure | test assertion fail | retry loop 허용 |

## 개선 완료 조건

이 issue register의 개선은 단순 문서 작성으로 끝나지 않는다. 최소 완료 조건은 다음과 같다.

1. preflight가 capability matrix를 생성한다.
2. 동일 environment blocker는 같은 phase에서 반복 retry하지 않는다.
3. runtime parity smoke가 원본 fixture와 phase-status를 변경하지 않는다.
4. blocked QA/HANDOFF도 workflow-enforcement를 통과한다.
5. phase timing telemetry가 wall-clock과 active time을 분리한다.
6. Docker daemon 없음은 Phase 07 같은 deployment smoke에서 즉시 handoff된다.
