# 2026-05-12 KST session history analysis

작성일: 2026-05-13
기준 저장소: `C:\dev\claude-settings`

## Scope

이 문서는 한국시간 기준 2026-05-12에 작업된 Codex Desktop 세션과, 2026-05-12 작업에서 2026-05-13로 이어진 후속 세션을 정리한다.

분석 기준:

- KST 2026-05-12 본창: UTC `2026-05-11T15:00:00Z` 이상, UTC `2026-05-12T15:00:00Z` 미만 이벤트가 있는 세션
- KST 2026-05-13 후속창: UTC `2026-05-12T15:00:00Z` 이상, UTC `2026-05-13T15:00:00Z` 미만 이벤트가 있는 세션 중 12일 작업과 직접 이어진 세션
- 원본: `C:\Users\moon\.codex\sessions\2026\05\11`, `C:\Users\moon\.codex\sessions\2026\05\12`, `C:\Users\moon\.codex\sessions\2026\05\13`
- 보조 인덱스: `C:\Users\moon\.codex\session_index.jsonl`
- 보조 요약: `C:\Users\moon\.codex\memories\MEMORY.md`, `C:\Users\moon\.codex\memories\rollout_summaries\`

주의:

- `Signals`는 `EPERM`, `blocked`, `timeout`, `split-brain`, `stale`, `failed` 같은 키워드 기반 휴리스틱이다. 실제 실패 건수와 동일하지 않다.
- 일부 forked/sub-agent JSONL은 파일명 thread id와 `session_meta.payload.id`가 다르게 보일 수 있다. 이 경우 원본 파일명을 별도 식별자로 함께 봐야 한다.
- 현재 분석 세션 `019e1ed8-3312-7f80-8edb-dd7e02cd2dd1`은 원본 수집/분석 작업 자체라서 업무 경향 분석에서는 제외한다.

## Executive Summary

총 35개 JSONL 파일이 범위에 걸렸다.

- KST 2026-05-12 본작업: 24개 파일
- KST 2026-05-12에서 2026-05-13로 이어진 overlap: 3개 핵심 흐름
- KST 2026-05-13 후속: 11개 파일
- 주제는 대부분 `claude-settings` 하네스 안정화다. 특히 lifecycle projection, blocker closeout, delegated-terminal split-brain, code-review-graph 강제 사용, plan-writer 독립 리뷰 루프가 반복됐다.

핵심 흐름:

1. 5월 11일 밤에 시작한 final-outcome/closeout projection 작업이 5월 12일 새벽까지 이어졌다.
2. 5월 12일 오전에는 `.claude` 한영 동기화, 하네스 이상징후 inventory, residual anomaly remediation, EPERM blocker 수습이 집중됐다.
3. 5월 12일 오후에는 blocker closeout 재발 방지, lifecycle projection, session heartbeat monitoring이 반복됐다.
4. 5월 12일 밤부터 5월 13일 오전까지는 delegated-terminal 경로 이탈 및 split-brain 재발 방지 계획, moonshot-plan-writer의 Reviewer/Writer loop, residual harness rebaseline이 이어졌다.

## Session Inventory

| Window | KST start | KST end | Thread | Size MB | Events 12 | Events 13 | Signals | First user intent |
|---|---:|---:|---|---:|---:|---:|---:|---|
| May12 | 2026-05-11 22:33:27 | 2026-05-12 00:04:53 | `019e173d` Refactor closeout projection | 1.06 | 34 | 0 | 122 | closeout projection 잔존 이상징후 개선 계획 리뷰 |
| May12 | 2026-05-11 23:31:34 | 2026-05-12 06:41:54 | `019e1773` final outcome state model 작업 | 2.96 | 584 | 0 | 473 | final outcome 상태 모델 작업문서 생성/실행 |
| May12 | 2026-05-12 06:41:06 | 2026-05-12 06:57:54 | `019e18fc` 하네스 이상징후 점검 | 0.55 | 85 | 0 | 43 | `019e1773` 작업 내역에서 하네스 이상징후 리스트업 |
| May12 | 2026-05-12 06:59:01 | 2026-05-12 07:19:30 | `019e190c` 동기화 상태 확인 | 1.25 | 463 | 0 | 192 | `.claude` 영어/한글 세트 동기화 확인 |
| May12 | 2026-05-12 07:03:23 | 2026-05-12 14:26:21 | `019e1910` 하네스 개선계획 진행 | 7.95 | 2836 | 0 | 1366 | 잔여 하네스 이상징후 개선계획 진행 |
| May12 | 2026-05-12 09:14:53 | 2026-05-12 10:39:22 | `019e1989` 세션 모니터링/리뷰어 | 2.04 | 567 | 0 | 259 | `019e1910` 세션 2분 간격 트래킹 |
| 12-13 overlap | 2026-05-12 09:19:26 | 2026-05-13 00:59:17 | `019e198d` code-review-graph 사용 여부 | 1.61 | 333 | 206 | 202 | code-review-graph 실제 사용 여부 확인 |
| May12 | 2026-05-12 09:49:44 | 2026-05-12 10:34:54 | `019e19a9` code-review-graph 강제 적용 | 0.74 | 155 | 0 | 75 | code-review-graph 강제 사용 계획 검토 |
| May12 | 2026-05-12 10:53:40 | 2026-05-12 14:29:16 | `019e19e3` 하네스 이상징후 확인 | 8.12 | 1880 | 0 | 1019 | `019e1910` 내역 기반 하네스 이상징후 재확인 |
| May12 | 2026-05-12 11:34:08 | 2026-05-12 13:28:10 | `019e1a08` Phase 01 EPERM blocker 수정 | 3.11 | 1145 | 0 | 635 | EPERM blocker 반복 기록 문제 수습 |
| May12 | 2026-05-12 13:48:16 | 2026-05-12 13:48:19 | `019e1a83` runtime probe | 0.09 | 13 | 0 | 3 | `RUNTIME_OK` probe |
| May12 | 2026-05-12 14:09:36 | 2026-05-12 14:14:06 | `019e1a96` 커밋 산출물 제외 | 0.45 | 171 | 0 | 64 | generated fixture JSON 커밋 제외 처리 |
| 12-13 overlap | 2026-05-12 14:29:51 | 2026-05-13 08:54:05 | `019e1aa9` 잔존 하네스 plan rebaseline | 2.75 | 718 | 369 | 527 | 잔존 하네스 개선계획 작업문서 생성 및 재시작 |
| May12 | 2026-05-12 14:40:12 | 2026-05-12 15:12:17 | `019e1ab2` 이상징후 트래킹 | 1.68 | 464 | 0 | 266 | `019e1aa9` 세션 2분 간격 이상징후 tracking |
| May12 | 2026-05-12 14:58:12 | 2026-05-12 21:49:21 | `019e1ac3` 재발 결함 방지 계획 | 5.67 | 2121 | 0 | 1055 | 반복 결함 해결 계획 수립 |
| May12 | 2026-05-12 15:01:05 | 2026-05-12 16:10:40 | `019e1ac6` blocker closeout 재발 방지 | 0.80 | 160 | 0 | 95 | blocked 상세 보존 계획 리뷰 |
| May12 | 2026-05-12 16:53:41 | 2026-05-12 21:49:55 | `019e1b2d` 세션 트래킹 | 3.93 | 1541 | 0 | 875 | `019e1ac3` 작업 세션 2분 간격 tracking |
| May12 | 2026-05-12 21:42:25 | 2026-05-12 21:52:49 | `019e1c34` 플랜 검토 루프 추가 | 0.54 | 187 | 0 | 67 | plan-writer에 Reviewer/Writer 반복 루프 추가 구상 |
| 12-13 overlap | 2026-05-12 21:51:53 | 2026-05-13 10:03:14 | `019e1c3e` delegated-terminal split-brain 방지 | 10.06 | 1051 | 2649 | 1881 | delegated-terminal 경로 이탈 및 split-brain 재발 방지 계획 |
| May12 | 2026-05-12 22:16:00 | 2026-05-12 22:20:11 | `019e1c54` delegated-terminal 계획 검토 | 0.68 | 160 | 0 | 60 | split-brain plan review fork |
| May12 | 2026-05-12 22:21:46 | 2026-05-12 22:32:43 | `019e1c59` reviewer 지적 반영 | 0.79 | 249 | 0 | 108 | split-brain plan reviewer feedback 반영 |
| May12 | 2026-05-12 22:33:23 | 2026-05-12 22:36:35 | `019e1c64` split-brain 계획 재검토 | 0.65 | 179 | 0 | 58 | split-brain plan 재검토 |
| May12 | 2026-05-12 22:37:13 | 2026-05-12 22:43:06 | `019e1c67` DIR-09 plan update | 0.69 | 194 | 0 | 58 | DIR-09 plan update 적용 |
| May12 | 2026-05-12 22:43:36 | 2026-05-12 22:46:02 | `019e1c6d` 계획 패키지 최종 검토 | 0.60 | 186 | 0 | 47 | split-brain plan final review |
| May12 | 2026-05-12 22:57:11 | 2026-05-12 23:23:24 | `019e1c79` 세션 페이즈러너 추적 | 1.26 | 329 | 0 | 186 | `019e1c3e` phase-runner 정상 동작 tracking |
| May13 follow-up | 2026-05-13 00:26:55 | 2026-05-13 00:33:30 | `019e1ccc` residual harness plan review | 0.54 | 0 | 140 | 90 | residual harness plan read-only review |
| May13 follow-up | 2026-05-13 00:28:21 | 2026-05-13 00:35:01 | `019e1ccd` code-review-graph package writer | 0.27 | 0 | 69 | 39 | code-review-graph package Writer Agent |
| May13 follow-up | 2026-05-13 00:30:23 | 2026-05-13 00:38:48 | `019e1ccf` residual harness plan writer | 0.23 | 0 | 61 | 35 | residual harness plan rewrite |
| May13 follow-up | 2026-05-13 00:40:09 | 2026-05-13 00:41:59 | `019e1cd8` plan package review | 0.17 | 0 | 44 | 28 | revised package read-only review |
| May13 follow-up | 2026-05-13 00:42:36 | 2026-05-13 00:47:44 | `019e1cda` writer revision | 0.30 | 0 | 74 | 40 | Writer Agent revision |
| May13 follow-up | 2026-05-13 00:56:23 | 2026-05-13 00:57:40 | `019e1ce7` revised plan review | 0.17 | 0 | 43 | 26 | second Reviewer Agent review |
| May13 follow-up | 2026-05-13 09:15:50 | 2026-05-13 09:17:35 | `019e1eb0` moonshot plan review | 2.04 | 0 | 913 | 162 | split-brain plan review continuation |
| May13 follow-up | 2026-05-13 09:17:51 | 2026-05-13 09:18:35 | `019e1eb2` split-brain plan revision | 1.89 | 0 | 872 | 131 | split-brain plan v2 revision |
| May13 follow-up | 2026-05-13 09:22:44 | 2026-05-13 09:24:14 | `019e1eb6` plan v2 review | 2.08 | 0 | 919 | 154 | plan v2 review |
| May13 follow-up | 2026-05-13 09:24:32 | 2026-05-13 09:27:15 | `019e1eb8` plan package document fix | 2.17 | 0 | 937 | 159 | plan package document update |
| Excluded-current | 2026-05-13 09:59:33 | 2026-05-13 10:04:06 | `019e1ed8` this analysis | 0.34 | 0 | 109 | 34 | 5월 12일 세션 내역 분석 요청 |

## Thematic Timeline

### 1. Final outcome and closeout projection

관련 세션:

- `019e173d` Refactor closeout projection
- `019e1773` final outcome state model 작업
- `019e18fc` 하네스 이상징후 점검

요약:

- 5월 11일 밤에 시작된 closeout projection 개선이 5월 12일 새벽까지 이어졌다.
- 핵심 관심사는 `finished/success`, `success_with_warning`, stale blocker field, completion state projection이 서로 충돌하지 않게 만드는 것이었다.
- 이후 `019e18fc`에서 `019e1773` 작업 내역을 다시 읽고 이상징후 inventory를 정리했다.

판단:

- 작업 실패 자체보다 "완료 상태를 어떻게 truth source에 표현할 것인가"가 중심이었다.
- 이 시점부터 사용자 요구는 source-only 설명보다 실제 session JSONL, phase-status, workflow state를 대조하는 방향으로 강해졌다.

### 2. 한영 동기화와 code-review-graph 강제 사용

관련 세션:

- `019e190c` `.claude` 한영 세트 동기화
- `019e198d` code-review-graph 사용 여부 확인
- `019e19a9` code-review-graph 강제 적용 계획
- `019e1ccd` code-review-graph package writer

요약:

- `.claude`의 영어/한국어 skill/doc pair가 실제로 동기화되어 있는지 확인했다.
- 이후 code-review-graph가 실제 코드 탐색/리뷰에서 사용되는지 의심을 제기했고, broad file read와 토큰 낭비를 줄이기 위해 강제 사용 계획을 별도 package로 만들었다.
- 5월 13일 00시대에는 Reviewer/Writer Agent 기반 plan-writer loop가 이 계획 패키지에 적용됐다.

판단:

- 단순 정책 문구 추가가 아니라 "agent execution path에서 실제 도구 사용을 강제할 수 있는가"가 핵심이었다.
- 12일 작업의 후반부에는 계획 작성 자체도 독립 Reviewer/Writer 루프를 통과해야 한다는 운영 모델로 이동했다.

### 3. Residual anomaly remediation and EPERM blocker

관련 세션:

- `019e1910` 하네스 개선계획 진행
- `019e1989` 2분 세션 모니터링
- `019e19e3` 이상징후 재확인
- `019e1a08` Phase 01 EPERM blocker 수정

요약:

- `019e1910`은 12일 오전의 가장 큰 작업 세션이었다. 잔여 하네스 이상징후 개선계획을 실제로 진행했다.
- 별도 모니터링 세션들이 `phase-status.yaml`, workflow JSON, debug/event logs를 대조하며 진행 상태와 이상징후를 추적했다.
- EPERM blocker가 반복적으로 새 verdict 파일만 갱신하면서 Phase 01을 계속 막는 문제가 발견되어 수습됐다.

판단:

- `debug.jsonl` 단독은 liveness truth source로 부족했다.
- 신뢰 가능한 판단에는 `phase-status.yaml`, `current-run.json`, `active-phase-run.json`, `latest-dispatch.json`, `events.jsonl`, generated closeout artifacts를 같이 봐야 했다.
- 반복 blocker는 "새 파일이 생긴다"보다 "같은 blocker를 종료 조건 없이 재기록한다"가 문제였다.

### 4. Blocker closeout hardening

관련 세션:

- `019e1a96` generated fixture JSON 커밋 제외
- `019e1aa9` residual harness plan rebaseline
- `019e1ab2` 2분 tracking
- `019e1ac3` 재발 결함 방지 계획
- `019e1ac6` blocker closeout 재발 방지 리뷰

요약:

- generated fixture/runtime 산출물이 Git 변경사항에 잡히는 문제를 제외 처리했다.
- residual harness plan은 이미 고친 범위를 제외하고 remaining gaps 중심으로 다시 잡혔다.
- blocker closeout은 terminal blocked 상태가 heartbeat, lease mirror, finalize, remediation retry 과정에서 `running`, `completed`, `failed` 등으로 흐려지지 않도록 canonical evidence를 보존하는 방향으로 정리됐다.

판단:

- `BLOCKER_EVIDENCE.jsonl`, `ATTEMPT_LEDGER.jsonl`, `projection-manifest.json` 같은 machine-readable evidence가 중요해졌다.
- canonical source가 없을 때만 legacy verifier mode를 허용하는 쪽이 안전하다.

### 5. Delegated-terminal split-brain and plan-writer loop

관련 세션:

- `019e1c34` plan-writer Reviewer/Writer loop 구상
- `019e1c3e` delegated-terminal split-brain 방지
- `019e1c54`, `019e1c59`, `019e1c64`, `019e1c67`, `019e1c6d` review/revision fork
- `019e1c79` phase-runner tracking
- `019e1eb0`, `019e1eb2`, `019e1eb6`, `019e1eb8` 5월 13일 오전 후속 review/revision

요약:

- 12일 밤부터 13일 오전까지 가장 큰 흐름은 delegated-terminal 경로 이탈과 split-brain 재발 방지였다.
- plan-writer에 Reviewer Agent와 Writer Agent가 별도 세션에서 ambiguity threshold까지 반복하는 기능을 붙이려는 요구가 나왔다.
- 여러 forked review 세션이 생성됐고, 같은 parent thread id처럼 보이는 로그가 여러 파일에 나뉘어 남았다.

판단:

- 이 영역은 단순 plan 문서 작성이 아니라 "runner가 어느 plan package를 truth source로 삼는가"와 "delegated-terminal이 stale direct runner target으로 빠지지 않는가"가 핵심이다.
- 파일명 thread id와 session_meta id가 어긋나는 로그가 있어, 후속 분석 도구는 파일명 id, session_meta id, session_index id를 모두 저장해야 한다.

## Repeated Anomalies

### A1. Source-of-truth split-brain

증상:

- `masterPlan`, `executionRoot`, `goalRuntime.objective`, `phase-status.yaml`, `latest-dispatch.json`이 서로 다른 plan/run을 가리킬 위험이 반복됐다.

추정 원인:

- prepared plan package, active runtime pointer, delegated-terminal runner target, closeout projection이 독립적으로 갱신된다.

개선 방향:

- dispatch 직전 pointer invariant 검증을 둔다.
- `stale_as_direct_runner_target`을 hard blocker로 취급한다.
- terminal state에서는 running/prepared pointer invariant와 terminal invariant를 분리한다.

근거 세션:

- `019e1aa9`
- `019e1c3e`
- `019e1eb0` ~ `019e1eb8`

### A2. Blocked state preservation failure

증상:

- `blocked` 상세가 heartbeat, lease mirror, finalize, remediation retry 과정에서 `running`, `completed`, `failed` 등으로 약화될 위험이 있었다.

추정 원인:

- terminal blocker evidence와 lifecycle projection writer가 분리되어 있고, closeout 단계마다 상태 vocabulary가 다르다.

개선 방향:

- `BLOCKER_EVIDENCE.jsonl` + `ATTEMPT_LEDGER.jsonl` + `projection-manifest.json`을 canonical evidence로 삼는다.
- canonical evidence가 없을 때만 legacy verifier mode를 허용한다.
- unrecovered blocker를 canonical final-complete verdict로 모델링하지 않는다.

근거 세션:

- `019e1ac3`
- `019e1ac6`
- `019e1a08`

### A3. Debug log 단독 liveness 판단

증상:

- session JSONL 또는 `debug.jsonl`이 멈춘 것처럼 보여도 실제 phase log와 workflow status는 진행 중일 수 있었다.

추정 원인:

- Codex session log, delegated terminal log, workflow status files의 갱신 cadence가 다르다.

개선 방향:

- heartbeat 판단은 `phase-status.yaml`, `current-run.json`, `active-phase-run.json`, `latest-dispatch.json`, `events.jsonl`, agent-loop logs를 조합한다.
- stale 판정에는 composite cursor fingerprint를 쓴다.

근거 세션:

- `019e1989`
- `019e1ab2`
- `019e1b2d`
- `019e1c79`

### A4. Repeated EPERM/blocker loop

증상:

- writer 포맷 오류는 지나갔지만 같은 EPERM blocker를 새 verdict 파일로 다시 기록하며 Phase 01이 반복적으로 막혔다.

추정 원인:

- 동일 blocker를 "이미 처리된 terminal condition"으로 인식하지 못하고 retry artifact만 새로 생성했다.

개선 방향:

- blocker identity를 stable key로 계산한다.
- 동일 blocker 반복 시 새 verdict 생성보다 stop reason과 remediation boundary를 먼저 고정한다.

근거 세션:

- `019e1a08`

### A5. Generated/runtime artifact Git pollution

증상:

- generated fixture JSON 같은 스크립트 산출물이 Git 변경사항에 잡혔다.

추정 원인:

- test fixture output과 source fixture의 경계가 명확하지 않았다.

개선 방향:

- runtime/generated artifact ignore 규칙을 source fixture와 분리한다.
- 커밋 전에는 `git status --short`, `git diff --name-status`, `git diff --stat`로 범위를 고정한다.

근거 세션:

- `019e1a96`

## Operational Lessons

- 세션 분석의 truth source는 하나가 아니다. Codex JSONL, `session_index.jsonl`, workflow runtime files, memory rollout summaries를 같이 봐야 한다.
- 날짜 기준은 반드시 KST/UTC를 명시해야 한다. `session_index.updated_at`은 UTC이고, 파일명은 KST처럼 보인다.
- 장기 작업은 "작업 세션"과 "모니터링 세션"이 분리된다. 모니터링 세션을 본작업 실패로 오해하면 안 된다.
- 5월 12일의 반복 패턴은 구현 부족보다 상태 모델/계약/runner pointer의 불일치였다.
- 앞으로 세션 분석 자동화를 만들면 최소한 `file_name_thread_id`, `session_meta_id`, `thread_name`, `start_kst`, `end_kst`, `events_by_kst_day`, `first_user_intent`, `cwd`, `artifact_paths`, `signal_keywords`를 구조화해야 한다.

## Source Files

대표 원본:

- `C:\Users\moon\.codex\sessions\2026\05\11\rollout-2026-05-11T22-33-14-019e173d-eb42-7fa1-a736-6ddc153be6e4.jsonl`
- `C:\Users\moon\.codex\sessions\2026\05\11\rollout-2026-05-11T23-31-29-019e1773-406e-7a51-81b6-0fb8b78951c1.jsonl`
- `C:\Users\moon\.codex\sessions\2026\05\12\rollout-2026-05-12T07-03-03-019e1910-ad5c-7733-a1d0-c4d174a4159b.jsonl`
- `C:\Users\moon\.codex\sessions\2026\05\12\rollout-2026-05-12T10-53-32-019e19e3-ad8d-79f3-98e7-e7eb3169f15b.jsonl`
- `C:\Users\moon\.codex\sessions\2026\05\12\rollout-2026-05-12T14-57-42-019e1ac3-39b3-7bb3-a71c-b12a63739296.jsonl`
- `C:\Users\moon\.codex\sessions\2026\05\12\rollout-2026-05-12T21-51-41-019e1c3e-3c0b-7da1-b77f-d4e651049e65.jsonl`
- `C:\Users\moon\.codex\sessions\2026\05\13\rollout-2026-05-13T09-24-27-019e1eb8-7c3c-77b3-b59a-65281fea3555.jsonl`

보조 요약:

- `C:\Users\moon\.codex\memories\MEMORY.md`
- `C:\Users\moon\.codex\memories\rollout_summaries\2026-05-12T00-14-45-dqv4-019e1910_session_monitoring_lifecycle_projection_hardening.md`
- `C:\Users\moon\.codex\memories\rollout_summaries\2026-05-12T05-29-26-3Z8R-residual_harness_plan_rebaseline_with_review_loop.md`
- `C:\Users\moon\.codex\memories\rollout_summaries\2026-05-12T06-00-54-2oPT-blocker_closeout_plan_review_v3_v7.md`
