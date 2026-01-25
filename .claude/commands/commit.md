---
description: Changes를 확인하고 Memory를 현행화한 후 커밋을 수행합니다.
argument-hint: [context]
allowed-tools: Bash(git status:*), Bash(git add:*), Bash(git diff:*), Bash(git commit:*), Bash(git log:*), mcp__memory__create_entities, mcp__memory__add_observations, mcp__memory__create_relations
---
1. git status, git diff, git log를 실행하여 변경 사항 분석
2. Memory MCP에 연관 엔티티 등록/수정 (현행화):
   - 변경된 파일들에서 도메인/기능 식별 (예: src/components/Button.tsx → "Button" 엔티티)
   - 기존 엔티티가 있으면 observations에 변경 내용 추가
   - 새로운 파일/기능이면 엔티티 생성 및 observations 등록
   - 엔티티 간 관계(relation) 설정 (예: "Button" → "uses" → "ThemeContext")
3. 적절한 파일들을 git add로 스테이징
4. 간결한 한글 커밋 메시지로 커밋 생성 (이모지, 특수문자 제외) - 최종 단계

사용자 컨텍스트: $ARGUMENTS
