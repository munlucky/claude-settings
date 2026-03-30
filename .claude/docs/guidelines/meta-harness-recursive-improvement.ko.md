# Meta-Harness 재귀 개선 운영

> `main`을 오염시키지 않고 하네스 자체를 개선해야 할 때 사용하는 운영 흐름입니다.

Last-Reviewed: 2026-03-30

## 목표

저장소 상태를 두 층으로 분리합니다.

- `main`에는 재사용 가능한 안정 하네스 자산만 유지
- 전용 브랜치/worktree에서는 재귀 개선 실험을 격리 실행

실험 브랜치에서는 fixture, 로그, scorecard, 임시 저장소를 만들어도 되지만, 이런 산출물은 모두 ignore 상태로 남아야 하며 promotion 대상이 되면 안 됩니다.

## 기본 레이아웃

- 안정 `main` worktree: 저장소 루트
- 재귀 개선 브랜치: `codex/harness-recursive`
- 재귀 개선 worktree: `.tmp/harness-worktrees/harness-recursive`
- candidate 브랜치: `codex/harness-main-candidate`
- candidate worktree: `.tmp/harness-worktrees/harness-main-candidate`
- 일회성 실행 산출물: `.tmp/harness-runs/<run-id>/`
- 선택적 generated repo: `.tmp/harness-workspaces/<run-id>/`

## 추적 대상과 ignore 대상

추적 대상:

- 재사용 가능한 `.claude` 자산
- `.claudeignore`
- `.gitignore`
- 의도적으로 하네스의 일부로 관리하는 verification fixture 와 reference plan

ignore 대상:

- 임시 worktree
- generated repo 또는 복제 fixture
- 로그, verdict JSON, score snapshot 같은 실행 산출물
- 하네스를 정의하지 않고 하네스를 시험하기 위해서만 존재하는 산출물

promotion 범위의 소스 오브 트루스는 `.claude/harness-promotion-paths.txt`입니다.

## Worktree 준비

기본 재귀 개선 worktree 를 준비하거나 재사용하려면 다음을 실행합니다.

```bash
bash .claude/scripts/harness-prepare-recursive-worktree.sh
```

기본 동작:

1. `.tmp/harness-worktrees/harness-recursive`가 이미 있으면 재사용합니다.
2. 없으면 `main`에서 `codex/harness-recursive` 브랜치를 만들어 worktree 를 준비합니다.
3. 이후 실험에 사용할 worktree 경로를 출력합니다.

환경 변수 override:

- `HARNESS_RECURSIVE_BRANCH`
- `HARNESS_RECURSIVE_WORKTREE`
- `HARNESS_RECURSIVE_BASE_BRANCH`

## Candidate Promotion 흐름

재귀 개선 브랜치의 재사용 가능한 하네스 변경을 분리된 candidate worktree 로 반입하려면 다음을 실행합니다.

```bash
bash .claude/scripts/harness-promote.sh --source codex/harness-recursive
```

promotion 스크립트는 다음을 수행합니다.

1. 기본 대상 브랜치를 `codex/harness-main-candidate`로 사용합니다.
2. `.tmp/harness-worktrees/harness-main-candidate`를 생성하거나 재사용합니다.
3. candidate worktree 의 whitelist 경로를 먼저 `main` 기준 상태로 되돌립니다.
4. 현재 source worktree 상태에서 whitelist 경로만 candidate worktree 로 복사합니다.
5. candidate worktree 에서 strict `meta_harness` 검증 명령을 실행합니다.
6. review/commit 가능한 candidate 반입 후보를 남깁니다.

이 스크립트는 `--allow-main-target` 없이는 `main`을 건드리지 않습니다.

## 명시적 Main 반영

candidate 브랜치를 검토한 뒤 정말로 `main`을 갱신하려면 candidate worktree 에서 다음을 실행합니다.

```bash
bash .claude/scripts/harness-promote.sh --source codex/harness-main-candidate --target main --target-base main --allow-main-target
```

이 단계는 `main` worktree 를 수정하기 때문에 의도적으로 명시적이어야 합니다.

## 일상 운영 루프

1. 재귀 개선 worktree 를 준비합니다.
2. fixture 생성, 점수 계산, 하네스 실험은 ignore 경로 안에서만 수행합니다.
3. 성공한 실험의 교훈을 재사용 가능한 `.claude` 자산으로 정리합니다.
4. promotion 스크립트로 candidate worktree 를 갱신합니다.
5. candidate 브랜치에서 review 와 commit 을 진행합니다.
6. `main` 반영은 별도의 release 단계에서만 수행합니다.

## 강제 규칙

- 재귀 개선 브랜치를 `main`에 직접 merge 하지 않습니다.
- 생성 산출물이나 로그를 `.claude/harness-promotion-paths.txt`에 추가하지 않습니다.
- release 의도가 없는 한 `main`을 대상으로 promotion 하지 않습니다.
- dirty 상태의 target worktree 로 promotion 하지 않습니다.
- 안정 브랜치에는 재사용 가능한 하네스 정의만 들어가도록 유지합니다.
