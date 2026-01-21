# 테스팅 가이드라인

## TDD 원칙

1. **인터페이스/타입 먼저 정의**
2. **실패하는 테스트 작성** (RED)
3. **최소 코드 구현** (GREEN)
4. **리팩토링** (REFACTOR)

## 커버리지 요구사항

- 최소 80% 커버리지
- 새 코드는 반드시 테스트 포함
- 버그 수정: 재현 테스트 먼저 작성

## 테스트 제외 조건 (Skip Conditions)

다음 경우 테스트를 생략할 수 있음:
- **테스트 프레임워크 미설정** (`jest.config`, `vitest.config` 등 없음)
- **프로토타입/POC 프로젝트** (명시적으로 표시된 경우)
- **테스트 인프라 없는 레거시 코드베이스**
- **설정/문서 변경만 있는 경우** (코드 로직 변경 없음)

> **참고**: 테스트 생략 시 커밋 메시지 또는 PR 설명에 사유 기록 필요.

## 테스트 유형

| 유형 | 대상 | 도구 |
|------|------|------|
| Unit | 유틸리티, 순수 함수 | Jest, Vitest |
| Integration | API 엔드포인트 | Supertest |
| E2E | 핵심 사용자 흐름 | Playwright, Cypress |

## 테스트 네이밍 컨벤션

```typescript
// describe-it 패턴
describe('UserService', () => {
  it('should return user by id', () => { })
  it('should throw error when user not found', () => { })
})
```

## Moonshot 워크플로우 연동

테스팅은 moonshot-orchestrator 워크플로우에 다음과 같이 통합됩니다:

- **simple**: `implementation-runner` → `verify-changes.sh`
- **medium**: ... → `codex-review-code` (테스트 검증 포함)
- **complex**: ... → `codex-review-code` → `codex-test-integration` (전체 테스트 검증)

### 자동 트리거 조건

| 조건 | 실행 스킬 |
|------|----------|
| complexity == complex | codex-test-integration |
| API 변경 포함 | codex-test-integration |
| 커버리지 < 80% | 추가 테스트 요청 |
