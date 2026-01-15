---
name: codex-review-code
description: claude-delegator(Code Reviewer 전문가)를 통해 구현 품질과 회귀 위험을 검토합니다. 복잡한 작업, 리팩터링, API 변경 후 사용하세요.
context: fork
---

# Codex 코드 리뷰 (claude-delegator 사용)

## 사용 시점
- 복잡한 작업 구현 후
- 리팩터링 작업
- API 변경
- 중요한 변경사항 병합 전

## 절차
1. 변경 범위, 변경된 파일, 핵심 동작 요약
2. context.md 경로를 캡처하고 관련 코드 읽기 (기본: `{tasksRoot}/{feature-name}/context.md`)
3. 아래 7-섹션 형식으로 위임 프롬프트 구성
4. **Codex 먼저 시도**:
   - `mcp__codex__codex` 호출 (developer-instructions에 Code Reviewer 지침 포함)
   - 성공 시 6단계로 진행
5. **Claude로 폴백** (Codex 사용 불가 시):
   - 에러 조건: "quota exceeded", "rate limit", "API error", "unavailable"
   - Claude가 아래 Code Reviewer 지침에 따라 직접 코드 리뷰 수행
   - 노트 추가: `"codex-fallback: Claude가 직접 리뷰 수행"`
6. 중대 이슈, 경고, 제안사항 기록
7. **`.claude/docs/guidelines/document-memory-policy.md` 참조**: 전체 리뷰는 `archives/review-v{n}.md`에 보관하고 `context.md`에는 짧은 요약만 남김

## 위임 형식

7-섹션 형식 사용:

```
TASK: [context.md 경로]의 구현을 [집중 영역: 정확성, 보안, 성능, 유지보수성]에 대해 검토합니다.

EXPECTED OUTCOME: 판정 및 권장사항이 포함된 이슈 목록.

CONTEXT:
- 검토할 코드: [파일 경로 또는 스니펫]
- 목적: [이 코드가 하는 일]
- 최근 변경사항:
  * [변경된 파일 목록]
  * [핵심 동작 요약]
- 기능 요약: [간략한 설명]

CONSTRAINTS:
- 프로젝트 규칙: [따라야 할 기존 패턴]
- 기술 스택: [언어, 프레임워크]

MUST DO:
- 우선순위: 정확성 → 보안 → 성능 → 유지보수성
- 중요한 이슈에 집중, 스타일 세부사항 지적하지 않기
- 로직/흐름 오류 및 엣지 케이스 확인
- 타입 안전성 및 오류 처리 검증
- API 계약 및 데이터 모델 일관성 확인

MUST NOT DO:
- 스타일 세부사항 지적 (포매터가 처리)
- 발생 가능성 낮은 이론적 우려사항 지적
- 수정된 파일 범위 외 변경 제안

OUTPUT FORMAT:
요약 → 중대 이슈 → 경고 → 권장사항 → 판정 (APPROVE/REJECT)
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

## 구현 모드 (자동 수정)

전문가가 이슈를 자동으로 수정하도록 하려면:

```typescript
mcp__codex__codex({
  prompt: "[동일한 7-섹션 형식, 단 추가: '발견된 이슈를 수정하고 변경사항을 검증하세요']",
  "developer-instructions": "[code-reviewer.md의 내용]",
  sandbox: "workspace-write",  // 구현 모드 - 파일 수정 가능
  cwd: "[현재 작업 디렉터리]"
})
```

## 출력 (patch)
```yaml
notes:
  - "codex-review: [APPROVE/REJECT], critical=[개수], warnings=[개수]"
```
