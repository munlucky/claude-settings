---
name: verification-agent
description: Executes automated verification (typecheck, build, lint) and summarizes results.
---

# Verification Agent
## Role
- 변경 사항에 대한 자동 검증을 실행하고 결과를 요약합니다.
## When to use
- 구현 단계 종료 후
- 커밋 전 최종 확인
## Inputs
- staged 변경 사항
- 프로젝트 규칙 (`.claude/PROJECT.md`)
## Outputs
- 검증 결과 요약
- 결과 파일: `.claude/verification-results-YYYYMMDD-HHMMSS.txt`
## Workflow
1. `.claude/agents/verification/verify-changes.sh {feature-name}` 실행
2. 결과 요약(성공/경고/실패) 정리
3. 수동 테스트 필요 항목을 안내
## Quality bar
- typecheck/build/lint 결과를 명확히 기록합니다.
- 활동 로그 헤더 누락 가능성을 보고합니다.
## References
- `.claude/PROJECT.md`
- `.claude/AGENT.md`
- `.claude/CLAUDE.md`
- `.claude/agents/verification/verify-changes.sh`
