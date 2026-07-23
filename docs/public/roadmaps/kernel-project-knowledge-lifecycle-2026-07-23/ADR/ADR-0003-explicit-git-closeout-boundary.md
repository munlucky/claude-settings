# ADR-0003: Explicit Git Closeout Boundary

- Status: Accepted for implementation plan
- Date: 2026-07-23

## Context

Relay의 `commit-moonshot`은 지식 갱신과 Git commit/push를 안전하게 결합하지만, Kernel lifecycle에 자동으로 넣으면 작업 완료, 프로젝트 지식 commit, Git commit이라는 서로 다른 권한이 혼합될 수 있다. 특히 사용자가 단순히 작업 완료를 요청했을 뿐인데 repository mutation이나 push가 발생해서는 안 된다.

## Decision

- Kernel에서 Git closeout은 사용자 명시 요청 또는 typed task contract의 `gitCloseout.requested=true`와 approval receipt가 있을 때만 실행한다.
- lifecycle 순서는 `accepted completion → project knowledge commit/no-change receipt → Git closeout`으로 고정한다.
- `close`, `완료`, `지식 갱신`은 commit/push 승인으로 해석하지 않는다.
- scoped staging allowlist를 사용하며 `git add -A`를 기본 금지한다.
- runtime DB, account-root/project knowledge state, generated bridge/profile, secret-like 파일, unrelated user changes를 기본 제외한다.
- push 완료는 local HEAD와 remote branch SHA parity가 확인된 경우에만 선언한다.
- Git events/receipt는 delivery evidence이며 Kernel completion decision을 생성하거나 변경하지 않는다.
- commit 이후 push 실패 시 local commit을 자동 reset하거나 force push하지 않는다.

## Consequences

### Positive

- 사용자 의도와 repository mutation 일치
- completion/knowledge/Git 권한 분리
- 생성물·비밀정보·사용자 변경의 오스테이징 방지
- commit/push 결과의 감사 가능성

### Negative

- explicit request schema와 approval receipt가 추가됨
- commit-only, push failure, parity mismatch 등 closeout 상태가 복잡해짐
- 일부 사용자는 기존 자동 commit 체인보다 한 단계 더 명시해야 함

## Rejected Alternatives

1. 모든 accepted run 자동 commit: 사용자 승인 및 unrelated change 경계 위반
2. knowledge commit과 Git commit을 하나의 명령으로만 제공: 실패/재시도/권한 구분 불명확
3. push 성공 exit code만 확인: remote parity를 보장하지 못함
4. generated/runtime state를 사용자가 요청하면 모두 stage: secret/state corruption 위험

## Verification

- no-request/no-approval/no-knowledge-receipt rejection
- scoped staging and denylist fixtures
- commit-only vs commit-and-push tests
- push failure and parity mismatch tests
- completion decision invariance before/after Git events
- idempotent retry and duplicate commit prevention