---
name: receiving-code-review
description: Collects and organizes code review feedback into actionable tasks.
---

# Receiving Code Review Skill

**역할**: 코드 리뷰 피드백을 수집·정리하고 후속 작업을 트래킹합니다.

## 입력
- 리뷰 댓글/이슈 링크
- 관련 커밋/PR 링크

## 동작
1. 피드백을 분류(버그/요구사항/스타일/질문)해 요약.
2. 후속 작업을 TODO로 정리하여 `pending-questions.md` 또는 작업 계획(context.md)에 반영.
3. 리뷰에서 확인해야 할 파일/라인을 링크로 기록.

## 출력 (예시)
```markdown
# 리뷰 요약
- 버그: fetch 에러 처리 누락 → `_fetch/executeRetry.client.ts`
- 요구사항: 빈 상태 메시지 추가 → page.tsx
- 질문: 페이징 서버/클라이언트? → pending-questions.md
```
