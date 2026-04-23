# Token Optimization Guidelines

이 문서는 짧은 정책 계층입니다. 구현 세부는 참조 문서와 스크립트에 둡니다.

## 현재 적용할 5개 축

1. **문서 계층 정리**
   - Tier-1 문서는 짧게 유지
   - 긴 예시와 템플릿은 `docs/reference/**`, `templates/**`로 이동
2. **출력 압축**
   - raw log를 열기 전에 compact summary 우선
   - 디버깅을 위해 산출물 경로는 항상 함께 남김
3. **토큰 감사**
   - 라인 수, compact stdout 크기, always-loaded 토큰 추정치, 그래프 도달 범위를 측정
4. **세션 압축**
   - 재개 상태는 요약 중심으로 유지
   - 긴 타임라인과 raw review는 archive로 이동
5. **컨텍스트 그래프**
   - 넓은 읽기 전에 의존 가능 파일을 먼저 계산
   - 저장소 전체 재독보다 reachable subset 우선

## 필수 운영 규칙

- 파일 본문 붙여넣기보다 경로와 라인 참조 우선
- payload가 필요하면 JSON-heavy blob보다 YAML snapshot 또는 짧은 bullet 요약 우선
- 병렬 작업은 중복 컨텍스트 대신 shared snapshot 하나를 우선
- compact 엔트리포인트를 기본 사용
  - `node .claude/scripts/knowledge-repo-audit.mjs --compact`
  - `node .claude/scripts/verify-phase-runtime-parity.mjs --compact ...`
  - `bash .claude/scripts/token-safe-git.sh status`

## 측정 규칙

- 구조 변경 전 baseline report 저장
- 변경 후 latest report 저장
- 아래 항목을 비교
  - 활성 문서/스킬 라인 수
  - compact command stdout 라인 수
  - always-loaded estimated tokens
  - context graph node/edge 수와 reachable subset 크기

## 참고 문서

- [Token Quick Start](/Users/dev/claude-settings/.claude/docs/reference/token-quick-start.md)
- [Token Architecture Map](/Users/dev/claude-settings/.claude/docs/reference/token-architecture-map.md)
- [Output Compaction](/Users/dev/claude-settings/.claude/docs/guidelines/output-compaction.md)
- [Session Compaction](/Users/dev/claude-settings/.claude/docs/guidelines/session-compaction.md)
- [Token Common Mistakes](/Users/dev/claude-settings/.claude/docs/reference/token-common-mistakes.md)

**작성일**: 2026-01-10
**버전**: 1.0
**상태**: 활성
