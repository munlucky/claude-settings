---
name: codex-test-integration
description: claude-delegator(Code Reviewer 전문가)를 통해 통합 영향 및 회귀 위험을 검증합니다. 복잡한 작업 또는 API 통합에 사용하세요.
context: fork
---

# Codex 통합 검증 (claude-delegator 사용)

## 사용 시점
- `complexity`: `complex` (항상)
- 또는 `apiSpecConfirmed == true && hasMockImplementation == true`
- 외부 API와의 통합
- 다중 컴포넌트 변경

## 절차
1. 변경 범위, 엔드포인트, 통합 지점 요약
2. context.md 경로를 캡처하고 관련 코드 읽기 (기본: `{tasksRoot}/{feature-name}/context.md`)
3. 아래 7-섹션 형식으로 위임 프롬프트 구성 (통합 중심)
4. **Codex 먼저 시도**:
   - `mcp__codex__codex` 호출 (developer-instructions에 Integration Reviewer 지침 포함)
   - 성공 시 6단계로 진행
5. **Claude로 폴백** (Codex 사용 불가 시):
   - 에러 조건: "quota exceeded", "rate limit", "API error", "unavailable"
   - Claude가 아래 통합 리뷰 지침에 따라 직접 통합 리뷰 수행
   - 노트 추가: `"codex-fallback: Claude가 직접 통합 리뷰 수행"`
6. 회귀 위험 및 추가 테스트 시나리오 기록
7. 결과를 저장해야 한다면 전체 리뷰는 `{tasksRoot}/{feature-name}/archives/`에 보관하고 `context.md`에는 짧은 요약만 남김

## 위임 형식

통합 중심 7-섹션 형식 사용:

```
TASK: [context.md 경로]의 통합 변경사항을 회귀 위험 및 계약 준수 측면에서 검증합니다.

EXPECTED OUTCOME: 추가 테스트 시나리오가 포함된 회귀 위험 평가.

CONTEXT:
- 검증할 통합: [기능/API 설명]
- 변경된 파일: [수정된 파일 목록]
- 영향받는 API 엔드포인트:
  * [엔드포인트 1: 메서드, 경로, 목적]
  * [엔드포인트 2: 메서드, 경로, 목적]
- 통합 지점: [외부 시스템, 서비스, 데이터베이스]

CONSTRAINTS:
- 하위 호환성 유지 필수
- 기존 계약을 깨뜨리지 않아야 함
- 기술 스택: [언어, 프레임워크, API 버전]

MUST DO:
- 모든 통합 지점에 걸친 회귀 위험 식별
- 계약 준수 확인 (요청/응답 스키마)
- 각 엔드포인트의 엣지 케이스 및 오류 처리 확인
- 통합 변경의 성능 영향 평가
- 누락된 테스트 시나리오 식별
- 적절한 오류 처리 및 재시도 로직 확인

MUST NOT DO:
- 모든 통합 지점을 확인하지 않고 승인
- 하위 호환성 우려사항 무시
- 엣지 케이스 분석 생략

OUTPUT FORMAT:
요약 → 회귀 위험 → 계약 준수 → 엣지 케이스 → 성능 우려사항 → 누락된 테스트 시나리오 → 필요한 추가 테스트
```

## 도구 호출

```typescript
mcp__codex__codex({
  prompt: "[전체 컨텍스트가 포함된 7-섹션 위임 프롬프트]",
  "developer-instructions": "[code-reviewer.md의 내용]",
  sandbox: "read-only",  // Advisory 모드 - 검토만
  cwd: "[현재 작업 디렉터리]"
})
```

## 구현 모드 (테스트 추가)

전문가가 누락된 테스트를 구현하도록 하려면:

```typescript
mcp__codex__codex({
  prompt: "[동일한 7-섹션 형식, 단 추가: '식별된 누락 테스트 시나리오를 구현하세요']",
  "developer-instructions": "[code-reviewer.md의 내용]",
  sandbox: "workspace-write",  // 구현 모드 - 테스트 파일 추가 가능
  cwd: "[현재 작업 디렉터리]"
})
```

## 출력 (patch)
```yaml
notes:
  - "codex-integration: [PASS/FAIL], regression-risks=[개수], extra-tests=[개수]"
```
