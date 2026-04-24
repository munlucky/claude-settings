# 외부 하네스 도입 준비

Last-Reviewed: 2026-04-24

## 목적

현재 Moonshot 하네스를 교체하지 않고 외부 harness/skill 전략을 선별적으로 도입하기 위한 준비 문서입니다.

이 패키지는 bulk-install 계획이 아닙니다.
외부 패턴을 `adopt`, `adapt`, `reject`, `defer` 중 하나로 판단하기 위한 review/pilot framework입니다.

## 현재 입장

로컬 하네스는 이미 runtime core를 소유합니다.

- `moonshot-phase-runner`
- `verification.contract.yaml`
- `SPRINT_CONTRACT`
- `QA_REPORT`
- `SCORECARD`
- `HANDOFF`
- phase lease / loop guard

따라서 외부 프로젝트는 실행 제어를 대체하는 것이 아니라 약한 절차를 보강해야 합니다.

## 도입 규칙

- 외부 skill을 production `.claude/skills`에 직접 설치하지 않습니다.
- 외부 skill 또는 harness는 sandbox/pilot 위치에서만 실행합니다.
- 모든 후보는 `adopt`, `adapt`, `reject`, `defer` 중 하나로 기록합니다.
- full prompt vendoring보다 로컬 전략 이식을 우선합니다.
- hook, shell command, network access, installer behavior가 있으면 보안 검토 대상입니다.
- `skill-composition`과 skill architecture inventory 갱신 없이 새 public entrypoint를 추가하지 않습니다.

## Wave 2 초점

Wave 2는 아래 패턴을 로컬로 흡수합니다.

- TDD-first 실행 규율
- systematic debugging과 blind retry 방지
- worktree prepare / baseline evidence
- plan의 exact files / commands / expected signals
- task-level `FULL / PARTIAL / NO` 상태 어휘

## Wave 3 초점

Wave 3는 agent 설정 경로를 ignore하는 downstream 프로젝트를 위해 project-local worktree prepare runtime을 추가합니다.

- 코드 격리는 계속 `git worktree add`를 사용합니다.
- `harness-prepare-worktree`가 worktree 생성 후 ignored `.claude`, `.agents`, 최소 `.codex` scaffold를 hydrate합니다.
- hydration은 allowlist 하네스 자산만 복사하고 logs, caches, memory, auth, verdict, browser runtime dependency는 제외합니다.
- baseline verification은 hydration 이후 실행하며 `.claude/worktree-prepare.json`에 evidence를 남깁니다.

## 파일

- `pilot-registry.md`: 후보 결정과 pilot 상태.
- `pilot-review-template.md`: 로컬 도입 전 후보 검토 체크리스트.

## 비목표

- `skills.sh` 대량 설치 없음.
- phase runner 교체 없음.
- `.codex/auth.json`, `.claude/memory.json`, logs, caches, runtime verdict state를 worktree로 복사하지 않음.
- 일상 harness 경로에 외부 benchmark dependency 추가 없음.
