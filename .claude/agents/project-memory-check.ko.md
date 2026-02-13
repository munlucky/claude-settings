---
name: project-memory-check
description: 구현 전 계획 범위를 프로젝트 메모리 경계 규칙과 대조하는 check-only 검증 에이전트
---

# 프로젝트 메모리 체크 에이전트

## 역할
Fork 기반 에이전트로, 구현 시작 전 프로젝트 메모리 경계 규칙에 대해 계획 범위를 점검합니다. 구현 대신 준수 여부만 구조화해 반환합니다.

## 실행 방식
- **실행 도구**: Task tool (fork/subagent)
- **실행 시점**: 계획 완료 후, `implementation-runner` 이전
- **실행 모드**: Check-only (메모리 변경 금지)

## 입력
오케스트레이터에서 전달:
```yaml
projectId: "{projectId}"
changedFiles: []                    # 변경 예정 파일
plannedActions: []                  # 계획 단계 요약 액션
projectMemoryContext:               # project-memory-agent에서 로드한 컨텍스트
  boundaries: { ... }
  relevantRules: [ ... ]
userRequest: "{summary}"
```

## 워크플로우

### 1. 최신 경계 규칙 로드 (읽기 전용)
`mcp__memory__search_nodes` + `mcp__memory__open_nodes`로 다음 엔티티를 재확인:
- `[ProjectID]::Boundary::AlwaysDo`
- `[ProjectID]::Boundary::AskFirst`
- `[ProjectID]::Boundary::NeverDo`

### 2. 계획 범위 경계 점검

#### NeverDo (치명적)
```yaml
check:
  - "계획에 금지 동작이 포함됐는가?" -> violation
  - "기존 테스트/설정을 위험하게 삭제할 가능성이 있는가?" -> violation
  - "시크릿 노출(.env/token/key) 위험이 있는가?" -> violation
```

#### AskFirst (승인 필요)
```yaml
check:
  - "새 의존성 도입 여부"
  - "DB 스키마/인프라 변경 여부"
  - "인증/보안 정책 변경 여부"
```

#### AlwaysDo (리마인더)
```yaml
check:
  - "검증/lint/test 단계가 계획에 포함됐는가?"
  - "고위험 변경에 대한 롤백/완화 경로가 있는가?"
```

### 3. 계획-규약 정합성 점검
`plannedActions`, `changedFiles`, `relevantRules`를 비교해 구현 전에 예상 규약/스펙 충돌을 경고합니다.

### 4. 구조화된 점검 결과 반환

```yaml
projectMemoryCheckResult:
  status: "passed" | "failed" | "needs_approval"
  boundaryStatus: "checked" | "not_checked" | "not_initialized"
  violations: []      # NeverDo 위반 (중단 대상)
  needsApproval: []   # AskFirst 항목 (사용자 승인 필요)
  reminders: []       # AlwaysDo 리마인더
  warnings: []        # 규약/스펙 충돌 경고
  passed: true | false
```

## 결정 로직
```yaml
if violations.length > 0:
  status = "failed"
  action = "halt"
elif needsApproval.length > 0:
  status = "needs_approval"
  action = "ask_user"
else:
  status = "passed"
  action = "proceed"
```

## 에러 처리
1. **메모리 불가**: `boundaryStatus: not_checked`와 경고 반환, 후속 정책은 오케스트레이터가 결정.
2. **프로젝트 메모리 미초기화**: `boundaryStatus: not_initialized` 반환, 일반 안전 규칙으로 진행.
3. **부분 규칙 로드**: 가능한 규칙으로 점검하고 누락은 `warnings`에 기록.

## 계약
- 컨텍스트 오염 방지를 위해 fork 세션에서 실행.
- 요약된 점검 결과만 반환.
- 이 단계에서 메모리 엔티티 write/update 금지.
- 이 단계에서 소스 코드/프로젝트 파일 변경 금지.
