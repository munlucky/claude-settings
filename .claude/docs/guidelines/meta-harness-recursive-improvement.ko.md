# Meta-Harness 재귀 개선 운영

> `main`을 오염시키지 않고 하네스 자체를 개선해야 할 때 사용하는 운영 흐름입니다.

Last-Reviewed: 2026-03-30

## 목표

저장소의 일상 상태를 두 층으로 분리합니다.

- `main`에는 재사용 가능한 안정 하네스 자산만 유지
- 전용 recursive 브랜치/worktree에서는 재귀 개선 실험을 격리 실행

실험 브랜치에서는 fixture, 로그, scorecard, 임시 저장소를 만들어도 되지만, 이런 산출물은 모두 ignore 상태로 남아야 하며 promotion 대상이 되면 안 됩니다.

## 기본 레이아웃

- 안정 `main` worktree: 저장소 루트
- 재귀 개선 브랜치: `codex/harness-recursive`
- 재귀 개선 worktree: `.tmp/harness-worktrees/harness-recursive`
- 일회성 실행 산출물: `.tmp/harness-runs/<run-id>/`
- 선택적 generated repo: `.tmp/harness-workspaces/<run-id>/`
- 선택적 임시 release candidate: 분리된 release review sandbox 가 필요할 때만 생성

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

## 선택적 임시 Release Candidate

`main` worktree 를 건드리지 않고 분리된 release review sandbox 가 필요할 때만 target 을 명시적으로 만듭니다.

```bash
bash .claude/scripts/harness-promote.sh --source codex/harness-recursive --target codex/harness-release-candidate --target-base main --target-worktree .tmp/harness-worktrees/harness-release-candidate
```

promotion 스크립트는 다음을 수행합니다.

1. 명시적 target branch 가 있어야만 동작합니다.
2. 요청한 target worktree 를 필요할 때만 생성하거나 재사용합니다.
3. 그 target worktree 의 whitelist 경로를 `main` 기준 상태로 되돌립니다.
4. 현재 source worktree 상태에서 whitelist 경로만 복사합니다.
5. target worktree 에서 strict `meta_harness` 검증 명령을 실행합니다.

이 temporary candidate 는 선택 사항이며, 기본 daily loop 의 일부가 아닙니다.

## 명시적 Main 반영

일상 운영에서는 `main` 과 recursive worktree 만 열어둡니다.

정말 `main` 으로 release 할 때만 recursive branch 또는 임시 release-candidate worktree 에서 selective path update 를 사용합니다. recursive branch 를 `main` 에 직접 merge 하면 안 됩니다.

## 일상 운영 루프

1. 재귀 개선 worktree 를 준비합니다.
2. fixture 생성, 점수 계산, 하네스 실험은 ignore 경로 안에서만 수행합니다.
3. 성공한 실험의 교훈을 재사용 가능한 `.claude` 자산으로 정리합니다.
4. recursive 브랜치에서 review 와 commit 을 진행합니다.
5. 필요할 때만 임시 release-candidate worktree 를 만들어 분리 검토합니다.
6. `main` 반영은 별도의 selective release 단계에서만 수행합니다.

## 강제 규칙

- 재귀 개선 브랜치를 `main`에 직접 merge 하지 않습니다.
- 생성 산출물이나 로그를 `.claude/harness-promotion-paths.txt`에 추가하지 않습니다.
- recursive 변경을 release 할 의도가 없는 한 `main`을 대상으로 promotion 하지 않습니다.
- dirty 상태의 target worktree 로 promotion 하지 않습니다.
- 안정 브랜치에는 재사용 가능한 하네스 정의만 들어가도록 유지합니다.
