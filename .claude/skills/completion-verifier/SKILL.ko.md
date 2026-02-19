---
name: completion-verifier
description: Acceptance 테스트를 실행하여 구현 완료를 검증하고, 실패 시 재시도 루프를 트리거합니다.
context: fork
---

# Completion Verifier 스킬

## 사용 시점

- 각 구현 Phase 완료 후
- 작업 완료 전 최종 확인
- 재시도 루프 트리거 시

## 입력

- `analysisContext.*` (구조화된 상태)
- `context.md` (경로: `analysisContext.artifacts.contextDocPath`, Acceptance Tests 섹션 포함)
- 테스트 프레임워크 (PROJECT.md에서: jest/vitest/agent-browser/playwright)
- `analysisContext.signals.allowIndeterminate` (예외 허용 여부, 기본값: `true`)

## Harness 게이트 정책

- 테스트 환경 미감지로 인한 `verificationState: indeterminate`는 기본적으로 `pass_with_warning`으로 처리합니다.
- `allowIndeterminate: false`인 엄격 모드에서는 indeterminate를 차단 상태로 처리합니다.
- `allowIndeterminate: true`:
  - 기본 운영 모드이며, 경고와 후속 조치를 남기고 진행합니다.

## Step 0: 테스트 환경 감지

> **중요**: 테스트 실행 전, 대상 프로젝트에 테스트 환경이 있는지 먼저 확인합니다.

### 감지 로직

```yaml
testEnvironment:
  detected: false
  framework: null      # jest | vitest | agent-browser | playwright | cypress | mocha | pytest | go-test | bats | null
  configFile: null
  testCommand: null

detection:
  # 1. PROJECT.md에서 테스트 설정 확인
  - source: "PROJECT.md → Testing Rules"
    check: "테스트 프레임워크 필드가 채워져 있는지"
    
  # 2. 테스트 설정 파일 확인
  - source: "filesystem"
    patterns:
      - "jest.config.*"
      - "vitest.config.*"
      - "playwright.config.*"
      - "cypress.config.*"
      - ".mocharc.*"
      - "pytest.ini"
      - "pyproject.toml [tool.pytest]"
      - "*_test.go"
      
  # 3. package.json에서 test 스크립트 확인
  - source: "package.json"
    check: "scripts.test 존재 AND 기본 에러 메시지가 아닌지"

  # 4. 기존 테스트 파일 확인
  - source: "filesystem"
    patterns:
      - "**/*.test.ts"
      - "**/*.test.tsx"
      - "**/*.test.js"
      - "**/*.spec.ts"
      - "**/*.spec.js"
      - "__tests__/**"
      - "tests/**"
      - "test/**"
```

### 테스트 환경 미감지 시

```yaml
action:
  1. signals.testEnvironmentDetected = false 설정
  2. 경고 로그: "⚠️ 테스트 환경 미감지. 자동 테스트 검증을 건너뜁니다."
  3. Self-Audit만 실행 (Step 2)
  4. 반환:
     completionStatus:
       testEnvironment: false
       selfAuditOnly: true
       verificationState: indeterminate
       allPassed: null  # 판단 불가
       gateDecision: pass_with_warning | failed
       # 결정 규칙:
       # - allowIndeterminate=true  -> pass_with_warning
       # - allowIndeterminate=false -> failed
       recommendation: "자동 검증을 위해 테스트 프레임워크 설정을 권장합니다"
```

### 테스트 환경 감지 시

```yaml
action:
  1. signals.testEnvironmentDetected = true 설정
  2. signals.testFramework = "{감지된 프레임워크}" 설정
  3. signals.testCommand = "{감지된 명령어}" 설정
  4. Step 1(전체 테스트 검증)으로 진행
```

## Step 1: Acceptance 테스트 실행

> `testEnvironmentDetected = true` 일 때만 실행

1. context.md에서 Acceptance Tests 섹션 파싱
2. 테스트 ID 및 파일 경로 추출
3. 감지된 명령어로 테스트 실행:
   ```bash
   # 기본 (npm 기반)
   npm test -- --testPathPattern="{test files}"
   
   # 또는 PROJECT.md에 설정된 명령어 사용
   {testCommand}
   ```
4. 결과 파싱 (테스트별 PASS/FAIL)
5. context.md 상태 컬럼 업데이트

### 통합 테스트 검증

단위 테스트 통과 후, 사용자 관점 흐름 검증:

```yaml
integrationVerification:
  # 1. context.md에서 사용자 흐름 식별
  flows:
    - name: "{요구사항의 흐름 설명}"
      type: integration | e2e
      testFiles: ["{관련 테스트 파일}"]
  
  # 2. 통합 테스트 존재 시 실행
  command: |
    npm test -- --testPathPattern="integration|e2e"
    
  # 3. 통합 테스트가 없지만 필요한 경우
  missingIntegrationTests:
    action: "미완료로 보고, 통합 테스트 작성 권장"
    severity: "WARN"  # 차단하지 않지만 기록
```

## Step 2: 자체 점검 (Self-Audit) — 항상 실행

> 테스트 환경 유무와 관계없이 항상 실행됩니다.

구현 완료 후 context.md의 요구사항과 대조:

> "구현이 끝난 뒤, 결과를 context.md의 요구사항과 비교하고
> 모든 항목이 충족되었는지 확인하세요.
> 충족되지 않은 항목이 있다면 나열하세요."

### Self-Audit 출력 형식

```yaml
selfAuditResult:
  requirementsMet:
    - "[REQ-1] 사용자 조회 API ✅"
    - "[REQ-2] 에러 핸들링 ✅"
  requirementsNotMet:
    - "[REQ-3] 페이지네이션 ❌ (미구현)"
  
  boundaryCheck:
    neverDoViolations: []
    askFirstItems: []
    alwaysDoCompleted:
      - "lint 실행"
      - "테스트 통과"
  
  readyForTest: true | false
  blockers:
    - "REQ-3 미구현"
```

## 출력

```yaml
completionStatus:
  testEnvironment: true | false
  selfAuditOnly: false
  allowIndeterminate: true | false
  verificationState: passed | failed | indeterminate
  gateDecision: pass | failed | pass_with_warning
  total: 5
  passed: 4
  failed: 1
  allPassed: false
  failedTests:
    - id: T2
      type: Unit
      file: ErrorHandler.test.tsx
      error: "Expected error message not shown"
  failedPhase: "Phase 1"
  recommendation: "ErrorHandler.tsx 수정 후 Phase 1 재실행"
  verdictArtifact:
    path: "{tasksRoot}/{feature-name}/verification-result.json"
```

### verificationState 계약

- `passed`: 테스트 실행 + 게이트 통과 (`allPassed: true`)
- `failed`: 테스트 실행 + 게이트 실패 (`allPassed: false`)
- `indeterminate`: 실행 가능한 테스트 환경 없음 (일반적으로 `allPassed: null`, Self-Audit 전용)
- `allowIndeterminate=true`(기본)면 `pass_with_warning`으로 진행합니다.
- `allowIndeterminate=false`면 차단 상태로 처리합니다.

## 재시도 로직

`verificationState: failed` AND `testEnvironment: true` 시:

1. **실패 Phase 식별** (테스트 유형 기반):
   - Unit FAIL → Phase 1 (Mock 구현)
   - Integration FAIL → Phase 2 (API 연동)

2. **실패에 대한 단위 테스트 추가** (미존재 시):
   - 해당 실패를 재현하는 단위 테스트 작성
   - 회귀 테스트로 버그를 기록

3. **실패 Phase로 돌아가기** (테스트 재작성 X):
   - `failedTests` 정보를 implementation-agent에 전달
   - implementation-agent는 **코드만 수정** (기존 테스트 재작성 금지)

4. **검증 재실행**:
   - 새 단위 테스트로 수정 확인
   - 전체 테스트 실행으로 회귀 없음 확인

5. **재시도 제한**:
   - Phase당 최대 2회 재시도
   - 2회 실패 후 → 사용자에게 개입 요청

## Skip Conditions

- 테스트 프레임워크 미설정 → **Self-Audit만** (완전 Skip 아님)
- context.md에 Acceptance Tests 없음 → Self-Audit만
- testing.md의 Skip Conditions 적용 (레거시, 프로토타입 등)

## 워크플로우

```
Implementation Phase 완료
        ↓
[Step 0] 테스트 환경 감지
        ↓
    감지?
     ↓         ↓
   true      false
     ↓         ↓
[Step 1]   [Step 2만]
테스트실행    Self-Audit
     ↓         ↓
[Step 2]   상태 반환
Self-Audit   (selfAuditOnly: true)
     ↓
  allPassed?
   ↓      ↓
  true   false
   ↓      ↓
 완료   단위테스트 추가 → 수정 → 재시도
```

## 도구 호출 예시

```bash
# 특정 테스트 실행
npm test -- --testPathPattern="batch.test|ErrorHandler.test"

# 커버리지 확인 (선택)
npm test -- --coverage --testPathPattern="..."
```

### 주의사항

- Self-Audit은 **보조 수단**이며, 실제 테스트를 대체하지 않습니다
- 요구사항 충족 여부는 주관적 판단이 포함될 수 있으므로, 테스트로 최종 검증합니다
- `neverDoViolations`가 있으면 즉시 중단하고 사용자에게 보고합니다
- 테스트 환경이 없을 때 Self-Audit이 최소 검증을 제공합니다
