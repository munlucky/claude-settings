# Phase 06 — `commit-moonshot` Kernel Closeout Integration v1

## Status

`complete`

## Objective

Relay의 `commit-moonshot`에서 검증된 Git closeout 규율을 Kernel 전용 lifecycle에 이식한다. 프로젝트 지식 closeout을 먼저 완료한 뒤, 사용자 또는 task contract가 명시적으로 요청한 경우에만 안전한 staging, commit, push, remote parity 확인을 수행한다.

## Dependencies

- Phase 05 accepted completion 기반 knowledge commit receipt
- Kernel completion decision
- explicit Git closeout request/approval

## Inputs and Read-only References

- `skills/commit-moonshot/SKILL.md`
- `skills/commit-moonshot/references/commit-closeout-internals.md`
- `scripts/commit-moonshot-memory-refresh.mjs`
- `scripts/commit-moonshot-closeout-event.mjs`
- `scripts/git-safe.mjs` 또는 repository Git safety helpers
- Kernel knowledge commit receipt
- project `.gitignore`, `.claudeignore`, package/profile manifests

## Owned Paths / Predicted Write Set

```yaml
ownedPaths:
  - skills/kernel-commit-closeout/SKILL.md
  - scripts/kernel/git/closeout.mjs
  - scripts/kernel/git/staging-policy.mjs
  - scripts/kernel/git/remote-parity.mjs
  - schemas/kernel.git-closeout-request.schema.json
  - schemas/kernel.git-closeout-receipt.schema.json
  - scripts/kernel/control-plane.mjs
  - scripts/kernel/state-store.mjs
  - bin/moon-relay-kernel.mjs
  - catalog/kernel-skills.json
  - catalog/kernel-skills.yaml
  - tests/kernel-git-closeout.test.mjs
  - tests/kernel-git-staging-policy.test.mjs
  - tests/kernel-git-remote-parity.test.mjs
sharedSurfaces:
  - scripts/kernel/control-plane.mjs
  - scripts/kernel/state-store.mjs
  - bin/moon-relay-kernel.mjs
  - catalog/kernel-skills.*
```

## Surface Classification

- Kernel Git closeout source: `source_only`
- Commit/push: `external_deployment_or_service`
- Kernel runtime events/receipts: `data_or_state_migration`

Git mutation은 explicit request와 project Git policy를 모두 요구한다.

## Invocation Contract

다음 중 하나가 있어야 한다.

```yaml
gitCloseout:
  requested: true
  mode: commit|commit_and_push
  approvedBy: user|operator
  approvalReceipt: string
```

또는 사용자가 현재 요청에서 명시적으로 commit/push를 지시한다. 단순 `CLOSE`, `완료`, `지식 갱신`은 Git closeout 승인으로 해석하지 않는다.

## Lifecycle Position

```text
PROVE
  → accepted completion
  → project knowledge commit/no-change receipt
  → Git closeout preflight
  → staging selection
  → commit
  → optional push
  → remote parity
  → Git closeout receipt
  → CLOSE projection
```

Knowledge write와 Git commit은 다른 의미의 commit이다.

- **Knowledge commit**: Kernel account-root project knowledge revision 반영
- **Git commit**: repository source history 반영

둘을 API, receipt, event taxonomy에서 명확히 분리한다.

## Preflight

- repository root와 current branch 확인
- detached HEAD/protected branch/dirty submodule 검사
- knowledge commit receipt 존재 또는 `no_change` 확인
- completion decision accepted 확인
- changed file inventory와 generated/runtime state 분리
- unrelated user changes가 있으면 자동 stage 금지, scoped staging만 허용
- secret-like file/content 및 large binary 경고
- project policy의 required tests/commit conventions 확인

## Staging Policy

기본 denylist:

```text
.moon-relay/**
.moonshot-relay/**
.claude/memory.json
.claude/memorygraph/**
.claude/cache/memorygraph/**
.codex/state/**
.qwen/** runtime-local generated state
.agents/** generated bridge
.mcp.json
*.sqlite
*.sqlite-wal
*.sqlite-shm
.env*
account-root knowledge/runtime paths
```

설치 manifest가 generated bridge/profile output으로 선언한 경로도 기본 제외한다. 사용자가 특정 generated 파일을 명시적으로 요청해도 secret/runtime state는 hard deny한다.

`git add -A`는 기본 금지하고 reviewed path allowlist로 `git add -- <paths>`를 수행한다.

## Commit Message

Relay `commit-moonshot` 규칙을 유지하되 Kernel adapter에서 task objective, verified change groups, knowledge closeout disposition을 사용한다.

- 제목: 한국어 Conventional Commit 스타일
- 본문: 기능 영역별 grouped bullets
- 지식 원문/MemoryGraph/KG dump를 포함하지 않는다.
- knowledge receipt의 status/count/digest 일부만 기록 가능하다.

## Event Taxonomy

- `kernel.git_closeout.started`
- `kernel.git_closeout.preflight_failed`
- `kernel.git_closeout.staging_selected`
- `kernel.git_closeout.commit_created`
- `kernel.git_closeout.commit_failed`
- `kernel.git_closeout.push_requested`
- `kernel.git_closeout.push_completed`
- `kernel.git_closeout.push_failed`
- `kernel.git_closeout.remote_parity_verified`
- `kernel.git_closeout.skipped`

이 이벤트는 delivery evidence이며 completion decision row를 만들지 않는다.

## Receipt

```yaml
gitCloseoutReceipt:
  schemaVersion: 1
  runId: string
  projectId: string
  requestedMode: commit|commit_and_push
  knowledgeCommitReceiptRef: string
  selectedPaths: []
  excludedPaths: []
  commitSha: string
  branch: string
  remote: string
  pushStatus: skipped|completed|failed
  remoteHeadSha: string
  parity: matched|mismatched|not_requested
  approvalReceipt: string
  status: completed|partial|failed|skipped
  digest: sha256
```

## CLI and Skill Routing

- 내부 capability: `kernel-commit-closeout`, `user-invocable: false`
- 공개 `moon-relay-kernel`이 explicit Git request에서만 capability를 활성화
- CLI 예시 계약:
  - `moon-relay-kernel git-closeout --run-id <id> --request-json <path>`
  - `--push`만으로 승인을 만들지 않으며 request JSON의 approval receipt 필요
- `close` 명령은 Git closeout 미요청 시 정상적으로 skip receipt를 남길 수 있다.

## Tasks

1. Relay commit skill을 Kernel runtime/state 경계에 맞게 분해 이식한다.
2. explicit request/approval schema와 resolver를 구현한다.
3. staging denylist/allowlist와 change ownership 검사를 구현한다.
4. commit message generator와 sanitized knowledge disposition을 구현한다.
5. push 및 HEAD↔origin parity verifier를 구현한다.
6. idempotent retry와 partial failure recovery를 구현한다.
7. Git closeout events/receipt를 Kernel DB/projection에 기록한다.

## Acceptance Criteria

- explicit request 없이 commit/push가 실행되지 않는다.
- accepted completion과 knowledge receipt 없이 Git closeout이 진행되지 않는다.
- runtime DB, account-root knowledge, generated bridge, secret 파일이 staging되지 않는다.
- unrelated user change가 자동 stage되지 않는다.
- commit-only는 push를 실행하지 않는다.
- push 완료 주장은 local HEAD와 origin branch SHA가 일치할 때만 가능하다.
- Git failure가 completion authority를 변경하지 않는다.
- 동일 run 재시도는 기존 commit을 중복 생성하지 않는다.

## Verification and Evidence

- no-approval/no-completion/no-knowledge-receipt rejection tests
- staging denylist/path ownership matrix
- mixed user changes fixture
- secret detection and generated profile fixtures
- commit-only/push success/push failure/parity mismatch tests
- branch protection/detached HEAD/remote missing tests
- idempotent retry and receipt tamper tests
- Kernel E2E optional Git closeout scenario

## Rollback

- staging 전 실패: repository mutation 없음
- staging 후 commit 전 실패: Kernel이 추가한 index entries만 restore
- commit 후 push 전 실패: local commit을 유지하고 partial receipt, 자동 reset 금지
- push 후 parity mismatch: failure receipt와 operator action을 제공하고 force push 금지

## Handoff

Phase 07은 이 capability가 package/profile에 internal-only로 노출되고 live adoption 없이 disposable repository에서 동작함을 검증한다.