---
title: Document Memory Policy
description: 활성 문서 크기, 아카이빙, 재개 상태를 위한 짧은 정책
---

# Document Memory Policy

이 문서는 짧은 정책 계층입니다. 긴 예시와 템플릿은 참조 문서로 분리합니다.

## 범위

- `{tasksRoot}/{feature-name}/` 아래의 활성 작업 문서
- `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md` 같은 실행 산출물
- 일별 세션 로그와 아카이브 로그

## 하드 한도

| 산출물 | 권장 상한 | 초과 시 조치 |
|--------|-----------|--------------|
| `context.md` | 8,000 tokens | 이전 버전 아카이브 |
| `specification.md` | 2,000 tokens | 전체 명세는 archives로 이동, 요약만 유지 |
| 리뷰 출력 | 4,000 tokens | 원본 리뷰는 보관하고 활성 문서에는 요약만 유지 |
| 일별 세션 로그 | 5,000 tokens | 분할하거나 다음 파일로 롤오버 |

## 필수 구조

- 작업당 활성 요약 문서는 하나만 유지
- 긴 이력은 `archives/` 아래로 이동
- 재개 상태는 아래 최신 문서에 남김
  - `HANDOFF.md`
  - `QA_REPORT.md`
  - `SCORECARD.md`
  - session index

## 필수 동작

- 원문 붙여넣기보다 요약 + 산출물 링크 우선
- 큰 명세는 전체 재독보다 섹션 참조 우선
- 한 `context.md`가 과도하게 커지면 서브태스크 분리
- 새 아카이브를 만들면 인덱스도 같이 갱신

## 스킬 기대 동작

- `session-logger`: 활성 로그는 짧게 유지하고 긴 타임라인은 archive로 이동
- `codex-review-code`: 활성 문서에는 findings 요약만 남기고 raw review는 archive
- `commit-moonshot`: 메모리 갱신 결과는 장문 대신 짧은 bullet로 정리
- `efficiency-tracker`: deprecated; 명시적인 과거 리포팅에 사용할 때만 현재 리포트는 얇게 유지하고 이전 상세는 archive

## 참고 문서

- [Token Quick Start](/Users/dev/claude-settings/.claude/docs/reference/token-quick-start.md)
- [Token Architecture Map](/Users/dev/claude-settings/.claude/docs/reference/token-architecture-map.md)
- [Session Compaction](/Users/dev/claude-settings/.claude/docs/guidelines/session-compaction.md)
- [Token Common Mistakes](/Users/dev/claude-settings/.claude/docs/reference/token-common-mistakes.md)
