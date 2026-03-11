# Context Readiness Schema

downstream 프로젝트에서 구현 전에 갖춰야 할 `context.md` 최소 구조입니다.

## 필수 섹션

```markdown
## Goal
- 한 줄 목표

## Constraints
- 핵심 규칙, 아키텍처 제한, 호환성 제약

## Acceptance Criteria
- 객관적 완료 기준

## Out of Scope
- 명시적 제외 범위

## Target Files
- 새 파일
- 수정 파일

## Verification Plan
- 실행할 명령어
- 수동/런타임 확인 항목
```

## 규칙
- 최소 schema는 짧고 명확하게 유지합니다.
- 상세 phase 계획은 이 최소 섹션이 갖춰진 뒤 추가합니다.
- `context-readiness-gate`는 이 구조를 기준으로 구현 가능 여부를 판단합니다.
- 이 저장소 같은 `meta_harness` 작업은 downstream schema 의무 대상이 아닙니다.
