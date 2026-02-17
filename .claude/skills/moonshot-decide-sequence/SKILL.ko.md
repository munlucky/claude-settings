---
name: moonshot-decide-sequence
description: `analysisContext`(작업 유형, 복잡도, 시그널)를 기준으로 단계(`phase`)와 실행 체인을 결정한다. 불확실성 검출 후 체인 구성 시 사용.
---

# PM 시퀀스 결정

## 공유 스키마 (analysisContext.v1)
```yaml
schemaVersion: "1.0"
request:
  userMessage: "..."
  taskType: feature|modification|bugfix|refactor|unknown
  keywords: []
repo:
  gitBranch: "..."
  gitStatus: clean|dirty
  openFiles: []
  changedFiles: []
signals:
  hasContextMd: false
  hasPendingQuestions: false
  requirementsClear: false
  implementationReady: false
  implementationComplete: false
  hasMockImplementation: false
  apiSpecConfirmed: false
  reactProject: false
estimates:
  estimatedFiles: 0
  estimatedLines: 0
  estimatedTime: unknown
phase: planning|implementation|integration|verification|unknown
complexity: simple|medium|complex|unknown
missingInfo: []
fixForward:
  enabled: true
  policy:
    critical: block           # 보안/데이터 무결성 → 머지 차단
    high: fix-forward-task    # 커밋 후 follow-up 태스크 자동 생성
    medium: merge-with-note   # 경고 기록 후 머지 허용
    low: auto-approve         # 자동 승인
  tasks: []                   # codex-review-code에서 생성된 follow-up 태스크
decisions:
  recommendedAgents: []
  skillChain: []
  parallelGroups: []
artifacts:
  contextDocPath: {tasksRoot}/{feature-name}/context.md
  verificationScript: .claude/agents/verification/verify-changes.sh
  runtimeVerificationScript: .claude/agents/verification/verify-runtime.sh
notes: []
```

## 단계(Phase) 규칙
1. hasPendingQuestions == true -> planning
2. implementationComplete == true && (complexity == complex 또는 (apiSpecConfirmed && hasMockImplementation)) -> integration
3. implementationComplete == true -> verification
4. requirementsClear && hasContextMd && implementationReady -> implementation
5. 그 외 -> planning

## 체인 규칙
skillChain에는 **moonshot-decide-sequence 이후** 실행할 단계만 포함한다(moonshot-* 스킬은 포함하지 않음).

- simple: implementation-runner -> verify-changes.sh
- medium: requirements-analyzer -> project-memory-check -> karpathy-execution-gate -> implementation-runner -> code-simplifier -> completion-verifier -> doc-auto-sync -> codex-review-code -> efficiency-tracker
- complex: pre-flight-check -> requirements-analyzer -> context-builder -> codex-validate-plan -> project-memory-check -> karpathy-execution-gate -> implementation-runner -> code-simplifier -> completion-verifier -> doc-auto-sync -> codex-review-code -> efficiency-tracker -> session-logger

**실행 규율 게이트 (Karpathy loop)**:
- medium/complex 작업은 첫 `implementation-runner` 직전에 `karpathy-execution-gate`를 반드시 실행한다.
- 게이트 핵심: 코딩 전 사고, 단순함 우선, 최소 변경, 목표 중심 실행.
- 게이트에서 차단 이슈가 나오면 코드 수정 전에 planning 단계로 복귀한다.

**웹 런타임 검증 규칙**:
- `signals.reactProject == true`이면 `verify-changes.sh` 이전에 `browser-verifier`를 삽입한다.
- `browser-verifier`는 `.claude/agents/verification/verify-runtime.sh`를 사용해 URL/E2E 런타임 검증을 수행한다.

**프로젝트 메모리 체크 의미**:
- `project-memory-check`는 `project-memory-agent`와 분리된 독립 단계로 유지한다.
- `project-memory-check`는 경계 검증 전용(check-only)이며, 메모리 로드/업데이트는 `project-memory-agent`가 담당한다.

**Phase runner 핸드오프 규칙**:
- 다단계 실행용 master-plan/phase 문서가 감지되면 `implementation-runner` 전에 `moonshot-phase-runner`를 삽입한다.
- `moonshot-phase-runner`는 준비 단계로만 취급하며, 최종 완료 게이트는 외부 phase 실행 후 `.claude/docs/phase-status.yaml` 업데이트를 기준으로 수행한다.

**리팩토링 전용 규칙** (taskType == refactor):
- `implementation-runner` 후 항상 `build-error-resolver` 포함하여 자동 빌드 검증
- 복잡한 리팩토링: implementation-runner가 단계별 모드로 실행되며 단계 간 빌드 체크 수행
- 참조: `.claude/rules/scope-confirmation.md`, `.claude/rules/refactoring-guidelines.md`

**참고**: `project-memory-check`는 계획 완료 후, 구현 시작 전에 실행되어 경계 준수 여부를 확인한다.

complex는 항상 테스트 기반 완료 검증을 포함한다.

**테스팅 연동** (참조: `.claude/rules/testing.md`):
- medium/complex 체인은 구현 후 `completion-verifier` 포함
- 커버리지 < 80% 시 추가 테스트 요청
- API 변경 시 통합 테스트 필수

**보안 및 빌드 에러 연동**:
- `security-reviewer`: 보안 우려 감지 시 트리거 (인증 변경, env 파일 수정, 새 의존성)
- `build-error-resolver`: `tsc`/`build` 실패 시 트리거, 다음 구현 단계 전에 삽입

**검증 종료 코드 전략**:
- `verify-changes.sh` `exit 1`: 빌드/타입체크/일반 검증 실패 → `build-error-resolver` 호출 후 구현 수정 재시도
- `verify-changes.sh` `exit 2`: 테스트 실패 → 테스트 우선 보정(테스트 추가/수정)으로 `implementation-runner` 재진입 후 검증 재실행
- `verify-runtime.sh` `exit 1`: 런타임 미가용(서버/환경 문제) → 런타임 준비 상태 복구 후 `browser-verifier` 재실행
- `verify-runtime.sh` `exit 2`: E2E 실패 → `verify-changes.sh`의 테스트 실패(`exit 2`)와 동일 정책 적용
- `completion-verifier` `verificationState: indeterminate`(일반적으로 `allPassed: null`)이면 최종 완료 판단 전에 fallback 게이트(`verify-changes.sh` + 필요 시 `browser-verifier`)를 수행한다.

**Fix Forward 리뷰 후 분기**:
- `codex-review-code` 이후 리뷰 판정에 따라 `fixForward.policy` 적용:
  - `CRITICAL` → **중단** (머지하지 않고 구현 재진입)
  - `HIGH` → **머지 + fix-forward 태스크 생성** → `fixForward.tasks[]`에 추가
  - `MEDIUM` → **머지 + 노트 추가** → `notes[]`에 기록
  - `LOW` / 이슈 없음 → **정상 머지**

## 병렬 실행 가이드
의존성이 없는 단계만 병렬로 실행한다. 결과가 다음 단계에 영향을 주면 병렬 금지.

**가능한 병렬 조합 예시**:
- `/moonshot-classify-task` 이후: `/moonshot-evaluate-complexity` + `/moonshot-detect-uncertainty`
- 구현 완료 후: `codex-review-code` + `verify-changes.sh` (리뷰 수정 시 `verify-changes.sh` 재실행)
- 웹 프로젝트 런타임 체크: `codex-review-code` + `browser-verifier` (코드 수정 후 런타임 재검증)
- 로깅: `efficiency-tracker` + `session-logger`

**병렬 금지 예시**:
- `requirements-analyzer` ↔ `context-builder` (요구사항 선행 필요)
- `codex-validate-plan` ↔ `implementation-runner` (계획 검증 후 구현)

## 출력 (patch)
```yaml
phase: planning
decisions.skillChain:
  - pre-flight-check
  - requirements-analyzer
  - context-builder
decisions.parallelGroups:
  - - moonshot-evaluate-complexity
    - moonshot-detect-uncertainty
decisions.recommendedAgents:
  - requirements-analyzer
  - context-builder
notes:
  - "phase=planning, chain=complex"
```
