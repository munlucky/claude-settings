# Moon Relay Kernel 세션·Run 수명주기

Last-Reviewed: 2026-07-30

Moon Relay Kernel은 Host 세션, Kernel Run, 프로젝트, 실제 workspace를 서로 다른 권한 경계로 취급한다. 모델에 공개되는 명령은 계속 `kernel next`와 `kernel report`뿐이며, Run 생성·재개·후속 전환은 Host와 Control Plane이 결정한다.

## Identity 계약

- Host 세션은 `<provider>:<native-session-id>` 형식이다. 같은 native ID라도 `codex:*`와 `claude:*`는 다른 세션이다.
- 새 Run ID는 `run-<uuid>` 형식의 opaque 값이다. thread, session, objective, project 또는 경로에서 유도하지 않는다.
- `CODEX_THREAD_ID`는 Codex Host 세션을 부트스트랩할 수 있지만 Run ID가 아니다.
- `MOON_RELAY_KERNEL_RUN_ID`는 명시적 Run 검증·재개용이고, `MOON_RELAY_KERNEL_SESSION_ID`는 현재 Host 세션용이다.

## 계약 우선 해석

`next --contract-json`은 먼저 Task Contract와 현재 project/session/workspace binding을 읽은 뒤 다음 모드 중 하나를 고른다.

| Run | Finalization | 계약 | 결과 |
|---|---|---|---|
| 없음 | 없음 | 있음 | `create` |
| active/blocked | pending | 동일 | `resume` |
| active/blocked | pending | 변경 | `revise` |
| completed | partial/blocked | 무관 | `finalization-retry` |
| completed | completed | 없거나 동일 | `done` |
| completed | completed | 새 계약 | `successor` |

`report`는 successor를 만들지 않으며 현재 active owner binding의 Run에만 기록한다.

## Successor 원자성

완료·finalization 완료 Run에 새 계약이 들어오면 Kernel은 하나의 SQLite transaction 안에서 successor Run과 초기 obligation/step을 만들고, 새 owner binding을 설정하고, 이전 binding을 `successor_started`로 종료하며, lineage와 이전 workspace lock 해제를 기록한다.

멱등 키는 `projectId`, provider-scoped `sessionId`, predecessor Run, successor workspace, Task Contract digest의 해시다. 같은 요청을 다시 보내도 successor가 추가 생성되지 않는다. predecessor의 objective, 상태, finalization, workspace와 owner lineage는 수정하지 않는다.

완료된 predecessor는 같은 프로젝트에 등록된 다른 worktree로 successor를 넘길 수 있다. active/blocked Run은 workspace를 이동할 수 없다.

## Workspace mutation 정책

- 서로 다른 physical workspace/worktree는 병렬 mutation이 가능하다.
- 같은 workspace에서는 fencing token이 있는 V2 lock 소유자 하나만 mutation할 수 있다.
- reviewer와 read-only binding은 같은 workspace를 공유할 수 있지만 `next`, `report`, finalize 같은 owner mutation 권한은 없다.
- lock 해제는 workspace, Run, session token, fencing token이 모두 일치해야 한다.

충돌 시 `workspace_mutation_conflict`와 `nextAction: create-worktree`를 반환한다. stale 또는 바뀐 lock을 넘기려 하면 `workspace_lock_handoff_failed`로 fail closed 한다.

## 호환성과 doctor

스키마 변경은 additive다. 기존 `codex-*` Run, receipt, evidence, knowledge와 legacy binding을 삭제하거나 다시 쓰지 않는다. provider가 검증되는 legacy binding만 한 번 canonical namespace로 이전하며, 중복 active owner가 있으면 임의 선택 없이 열기를 거부한다.

`kernel doctor --json`은 다음 코드를 보고한다.

- `ambiguous_session_binding`
- `terminal_run_active_binding`
- `orphaned_run_owner`
- `binding_namespace_problem`
- `stale_workspace_lock`

권한 경계 위반은 `run_session_mismatch`, `run_project_mismatch`, `run_workspace_mismatch`, `run_access_denied`, `provider_session_invalid` 등 안정적인 `errorCode`와 복구용 `nextAction`으로 반환한다.
