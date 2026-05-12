# Codex Fallback 가이드라인

## 개요

Codex 위임형 스킬은 Codex를 사용할 수 없을 때 일관된 fallback 동작을 따라야 합니다.

## Fallback 트리거

다음 오류는 fallback 조건으로 취급합니다.
- `quota exceeded`
- `rate limit`
- `API error`
- `unavailable`
- `timeout` (300초 초과)

Fallback은 필수 검증을 그대로 통과시키는 의미가 아닙니다. 필수 verifier 또는 closeout step에서 Codex를 사용할 수 없다면 blocked 또는 deferred-verification evidence를 emit하고 phase를 열린 상태로 유지합니다.

## 절차

```yaml
procedure:
  1. Codex 호출 시도: mcp__codex__codex({...})
  2. 오류가 fallback 조건과 일치하면:
     - 로그: "codex-fallback: Claude performing {task} directly"
     - Claude가 동일 가이드라인으로 작업 직접 수행
     - 출력 notes에 "codex-fallback: true" 추가
     - 작업이 필수 verifier이고 여전히 실행할 수 없다면 pass를 꾸며내지 말고 blocked evidence로 중단
  3. 결과와 함께 계속 진행
```

## Codex 스킬 적용 방식

Codex 스킬에는 아래 참조를 넣습니다.

```markdown
## Fallback
`.claude/docs/guidelines/codex-fallback.md`의 fallback 절차를 따른다.
```

## 적용 대상 예시

| 스킬 | fallback 동작 |
|------|---------------|
| `codex-validate-plan` | Claude가 계획 검토 수행 |
| `codex-review-code` | Claude가 코드 리뷰 수행 |
| `completion-verifier` | Claude가 테스트/검증을 직접 수행 |

## notes 형식

fallback이 발생하면 다음과 같이 기록합니다.

```yaml
notes:
  - "{skill}-result: [result], codex-fallback=true"
```
