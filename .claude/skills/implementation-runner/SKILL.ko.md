---
name: implementation-runner
description: 체인에서 실제 구현을 수행하고 완료 상태와 변경 파일을 `analysisContext`에 기록한다. 구현 단계에서 사용.
---

# 구현 실행

## 입력
- `analysisContext.request.userMessage`
- `analysisContext.request.taskType`
- `analysisContext.decisions.skillChain`
- `analysisContext.repo.openFiles`
- `analysisContext.artifacts.contextDocPath` (존재 시)

## 절차

### Step 0: 테스트 환경 감지

구현 시작 전, 대상 프로젝트에 테스트 환경이 있는지 확인:

```yaml
testEnvironmentCheck:
  # 테스트 설정 파일 확인
  configFiles:
    - "jest.config.*"
    - "vitest.config.*"
    - "playwright.config.*"
    - "pytest.ini"
    - "pyproject.toml [tool.pytest]"
  # package.json scripts.test 확인
  packageJson: "scripts.test != 기본 에러 메시지"
  # 기존 테스트 파일 확인
  testFiles: "**/*.test.* | **/*.spec.* | __tests__/ | tests/"

result:
  signals.testEnvironmentDetected: true | false
  signals.testFramework: "{감지됨}" | null
```

> `testEnvironmentDetected = false` 시, 테스트 동시 작성(Step 5)을 경고와 함께 건너뜁니다.

### 모든 작업
1. 요구사항과 컨텍스트를 확인한다.
2. 변경 범위를 정리하고 실제 구현을 수행한다.
3. 변경 파일 목록과 핵심 변경 요약을 기록한다.
4. 구현 완료 상태를 `analysisContext`에 반영한다.
5. **테스트 작성** (`testEnvironmentDetected = true` 시, Step 5 참조).

### 리팩토링 작업 (taskType == refactor)
> 참조: `.claude/rules/scope-confirmation.md`, `.claude/rules/refactoring-guidelines.md`

**1. 스코프 확인 (필수)**
시작 전:
- IN SCOPE 패키지/모듈 확인
- OUT OF SCOPE 항목 확인 (API 라우트, DB 스키마 등)
- 스코프가 불명확하면 사용자에게 확인 요청

**2. Baseline 에러 캡처**
```bash
npm run build 2>&1 | tee /tmp/baseline-errors.log
```

**3. 단계별 실행**
복잡한 리팩토링의 경우 단계로 분할:
1. 각 단계 완전 완료
2. 각 단계 후 빌드 검증:
   ```bash
   npx tsc --noEmit --pretty
   ```
3. 통과/실패 상태 보고
4. 빌드 통과 시에만 진행

**4. 에러 분리**
- 기존 에러 문서화 (baseline에서)
- 리팩토링으로 도입된 NEW 에러만 문서화

**5. 스코프 잠금**
OUT OF SCOPE 항목 수정 필요 시:
- 중지하고 사용자에게 허가 요청
- 결정 사항을 notes에 기록

**6. Self-Healing 루프** (자동 빌드 오류 수정)
리팩토링 중 빌드 실패 시:
```
retryCount = 0
maxRetries = 2

while (빌드 실패 AND retryCount < maxRetries):
  1. 빌드 에러 출력 분석
  2. 수정 적용 (참조: build-error-resolver 패턴)
  3. 빌드 검증 재실행
  4. retryCount++

if (maxRetries 후에도 실패):
  - 중지하고 사용자에게 보고
  - 시도한 모든 수정 사항 나열
  - 개입 요청
```

이를 통해 일반적인 문제에 대해 사용자 개입 없이 자율적 오류 해결이 가능합니다.

### Step 5: 테스트 동시 작성

> **`signals.testEnvironmentDetected = true` 일 때만**

기능 구현 시, **코드 변경과 함께 테스트를 작성**합니다:

```yaml
testCoCreation:
  # 1. 새로/변경된 함수의 단위 테스트
  unitTests:
    scope: "새로 추가 또는 크게 수정된 함수"
    naming: "{Component}.test.ts(x) or {module}.test.ts"
    minimum: 기능당 1개

  # 2. 사용자 관점 흐름의 통합 테스트
  integrationTests:
    scope: "새 API 엔드포인트 또는 사용자 흐름"
    naming: "{feature}.integration.test.ts"
    minimum: 흐름당 1개 (해당 시)
    
  # 3. 버그 수정 재현 테스트
  bugfixTests:
    scope: "수정 중인 각 버그"
    naming: "테스트 이름에 'regression' 또는 버그 ID 포함"
    requirement: "수정 전에 재현 테스트 먼저 작성"
```

**테스트 환경 미감지 시:**
```yaml
action:
  - 로그: "⚠️ 테스트 환경 없음. 테스트 동시 작성을 건너뜁니다."
  - signals.testsWritten = false 설정
  - 출력으로 진행
```

## 출력 (patch)
```yaml
signals.implementationComplete: true
signals.testEnvironmentDetected: true | false
signals.testsWritten: true | false
signals.selfHealingAttempts: 2  # 자동 수정 시도 횟수
repo.changedFiles:
  - src/...
  - src/__tests__/...  # 테스트 파일 포함
notes:
  - "구현: 완료, 변경 파일=3, 테스트 작성=2"
  - "리팩토링: scope_confirmed=true, phases=3, build_status=pass"
  - "self-healing: attempts=1, fixed=TS2339"  # 자동 수정된 에러용
  - "test-env: detected=true, framework=vitest"  # 또는 "test-env: not_detected"
```

## 규칙
- 다른 스킬/서브에이전트를 호출하지 않는다.
- 실패하거나 보류할 경우 `notes`에 사유를 기록한다.
- 리팩토링 작업: 시작 전 항상 스코프를 확인한다.
- Self-healing: 사용자에게 묻기 전 단계당 최대 2회 재시도.
- **테스트 동시 작성**: 테스트 환경이 있으면 테스트 없는 구현은 미완료 상태.
