# PROJECT.md

> `.claude` 설정 자산과 검증 도구를 보관하는 Harness Project 저장소의 운영 계약입니다.

Last-Reviewed: 2026-03-30

## 프로젝트 개요

- **서비스**: Harness Project - `.claude` 규칙, 스킬, 에이전트, 스크립트, 템플릿, 검증 계약을 관리하는 self-host 저장소
- **스택**: Bash, Python 3, Markdown, YAML, Git worktree
- **응답 언어**: 별도 요청이 없으면 한국어

## 핵심 규칙

1. `main`에는 재사용 가능한 하네스 소스만 반영하고, 생성된 테스트 결과물과 임시 worktree 및 실행 산출물은 ignore 상태로 유지합니다.
2. 하네스 재귀 개선은 분리된 브랜치/worktree에서 수행하고, 기본 promotion 대상은 `main`이 아니라 별도 candidate 브랜치/worktree입니다.
3. `main` 갱신은 승인된 하네스 화이트리스트 범위로 제한된 명시적 release 단계이며 strict `meta_harness` 검증을 통과해야 합니다.
4. 하네스 품질 정규화에 포함할 실제 구현 테스트는 구현을 시작하기 전에 `IMPLEMENTATION_TEST_BRIEF.md` 와 `RUN_MANIFEST.md` 를 먼저 작성해야 합니다.
5. release 준비도 판단은 `one-prompt baseline` 과 `recursive improvement delta` 를 분리해서 측정하는 `large` 풀스택 웹 벤치마크를 우선 기준으로 삼아야 합니다.
6. 문서 계약만 맞춘 large-web run은 실행 엔진 검증으로 충분하지 않으며, release 증거에는 별도의 `phase_runner_execution` run이 포함되어야 합니다.

## 테스트 규칙

- **테스트 프레임워크**: 계약 기반 shell 검증과 분리 worktree smoke flow
- **실행 명령**:
  - `bash .claude/scripts/harness-prepare-recursive-worktree.sh`
  - `bash .claude/scripts/harness-promote.sh --source codex/harness-recursive`
  - `bash .claude/scripts/harness-promote.sh --source codex/harness-main-candidate --target main --target-base main --allow-main-target`
  - `bash .claude/scripts/knowledge-repo-audit.sh`
  - `bash .claude/scripts/verify-code-policy.sh`
  - `bash .claude/scripts/workflow-enforcement.sh verify`
  - `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
  - `python3 .claude/scripts/normalize-harness-quality.py --input-glob ".tmp/harness-runs/**/harness-quality-run.json" --output ".tmp/harness-runs/harness-quality/latest.json"`

## 디렉터리/구조

```text
[프로젝트 루트]/
|-- .claude/
|-- docs/
|-- .tmp/
|-- install-claude.sh
`-- README.md
```

## API/데이터 통신 패턴

- **API 엔드포인트**: 상시 네트워크 API는 없고, 저장소 동작은 로컬 shell 스크립트와 Git 워크플로우로 노출됩니다.
- **헬퍼 함수**: `.claude/scripts/*.sh`, `.claude/scripts/*.py`, `.claude/agents/verification/` 하위 검증 헬퍼
- **계약 교환 방식**: 정책은 `.claude/verification.contract.yaml`, 작업 메모리는 `documentPaths.tasksRoot`, 승격 범위는 `.claude/harness-promotion-paths.txt`로 관리하며 recursive/candidate worktree 모두 같은 whitelist를 사용합니다.

## 타입/도메인 패턴

- **타입 정의 위치**: YAML 계약은 `.claude/verification.contract.yaml`, 운영 스키마와 체크리스트는 `.claude/docs/guidelines/`
- **도메인 모델**: `REQ-*`, `SCN-*`, `UAT-*`, `policySets`, scorecard objective, 하네스 promotion whitelist entry

## 권한/인증

- **인증 방식**: 로컬 파일시스템 권한과 Git 브랜치/worktree 격리
- **권한 체계**: 파괴적 작업이나 sandbox 밖 실행은 명시적 승인이 필요하고, `main` 갱신은 candidate branch에서만 수행하는 명시적 release 단계입니다.
- **민감 경로 정책**: `.gitignore`, `.claudeignore`, ignore된 `.tmp/harness-*` 디렉터리, strict `meta_harness` 검증으로 런타임 산출물 커밋을 막습니다.

## 문서 경로

```yaml
documentPaths:
  tasksRoot: "docs/claude-tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

## 환경 변수

```text
HARNESS_RECURSIVE_BRANCH
HARNESS_RECURSIVE_WORKTREE
HARNESS_RECURSIVE_BASE_BRANCH
HARNESS_CANDIDATE_BRANCH
HARNESS_CANDIDATE_WORKTREE
HARNESS_CANDIDATE_BASE_BRANCH
HARNESS_PROMOTION_PATHS_FILE
HARNESS_PROMOTION_SKIP_CHECKS
HARNESS_KNOWLEDGE_AUDIT_FILE
HARNESS_QUALITY_MIN_SAMPLES
VERIFY_CODE_POLICY_FILES
WORKFLOW_ENFORCEMENT_FILES
```
