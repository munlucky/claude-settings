---
title: Knowledge Repository Operations
description: TOC와 소스 오브 트루스 분리, 신선도 관리, 기계 점검 운영 지침
applies-to:
  - moonshot-orchestrator
  - pre-flight-check
  - doc-auto-sync
lastReviewed: 2026-02-19
---

# Knowledge Repository 운영 지침

## 1. 목적

실행 시점에 에이전트 지식을 안정적으로 사용하기 위해 다음을 분리합니다.

- 엔트리 맵(빠른 탐색)
- 소스 오브 트루스(지속 정책/절차)
- 기계 점검(신선도/링크 무결성)

## 2. 운영 모델

### 2.1 엔트리 맵 (TOC 전용)

- `AGENTS.md`와 `.claude/CLAUDE.md`는 짧게 유지합니다.
- 전체 정책을 중복 서술하지 말고 소스 오브 트루스 문서로 연결합니다.

### 2.2 소스 오브 트루스

- `.claude/PROJECT.md`: 프로젝트 계약 및 런타임 가정
- `.claude/rules/`: 강제 기본 규칙
- `.claude/docs/guidelines/`: 운영 절차
- `{tasksRoot}` (PROJECT 정의): 작업 단위 메모리

## 3. 디렉토리 계약

### 템플릿 저장소 (현재 저장소)

- 핵심 문서는 `.claude/` 아래에 둡니다.
- 작업 메모리 기본값: `.claude/docs/tasks`

### 설치 대상 프로젝트

- git 추적 문서 경로를 우선합니다.
  - `documentPaths.tasksRoot: docs/claude-tasks`
  - `documentPaths.guidelinesRoot: docs/guidelines`
- `.claude/`는 재사용 가능한 규칙/스킬/스크립트 중심으로 유지합니다.

## 4. 변경 워크플로우

1. 소스 오브 트루스 문서를 먼저 수정합니다.
2. `AGENTS.md` / `.claude/CLAUDE.md`의 링크를 갱신합니다.
3. 핵심 맵/계약 문서의 `Last-Reviewed: YYYY-MM-DD`를 갱신합니다.
4. `.claude/scripts/knowledge-repo-audit.sh`를 실행합니다.

## 5. 신선도 정책

- 핵심 맵/계약 문서: 45일 주기 검토
- 운영 가이드: 90일 주기 검토
- 로컬 링크 깨짐은 차단 이슈로 처리
- 리뷰 날짜 누락은 백필 전까지 경고로 처리

## 6. 감사 명령

```bash
.claude/scripts/knowledge-repo-audit.sh
```

출력:

- 콘솔 요약
- JSON 아티팩트: `.claude/knowledge-repo-audit-<runId>.json`

