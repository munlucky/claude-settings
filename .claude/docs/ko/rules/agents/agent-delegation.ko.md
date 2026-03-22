---
paths:
  - ".claude/agents/**/*.md"
  - ".claude/skills/**/*.md"
---

# 에이전트 위임 규칙

## 위임이 필요한 경우

- 복잡한 기능/리팩토링 -> `moonshot-orchestrator` 우선 사용
- 요구사항 불명확 -> `requirements-analyzer`
- 빌드/테스트 실패 -> `build-error-resolver` 또는 `completion-verifier`
- 보안 우려 -> `security-reviewer`
- 문서 정합성 작업 -> `documentation-agent`

## 위임하지 않는 경우

- 단순 읽기/질문 응답 작업
- 범위가 명확한 소규모 직접 수정

## 위임 품질 기준

- 범위, 기대 산출물, 제약 조건을 명확히 전달
- 최소 컨텍스트만 전달 (경로/요약, 전체 히스토리 제외)
- 최종 반영 전 위임 결과를 직접 검증
