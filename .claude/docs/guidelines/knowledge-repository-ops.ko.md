---
title: Knowledge Repository Operations
description: TOC와 소스 오브 트루스 분리, 신선도 관리, 기계 점검 운영 지침
applies-to:
  - moonshot-orchestrator
  - pre-flight-check
  - doc-auto-sync
lastReviewed: 2026-03-30
---

# Knowledge Repository 운영 지침

## 1. 목적

실행 시점에 에이전트 지식을 안정적으로 사용하기 위해 다음을 분리합니다.

- 엔트리 맵(빠른 탐색)
- 소스 오브 트루스(지속 정책/절차)
- 기계 점검(신선도/링크 무결성/로컬라이제이션 parity)

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
- 민감하거나 노이즈가 큰 경로는 추적된 `.claudeignore` 또는 동등한 문서 정책으로 관리합니다.

### 설치 대상 프로젝트

- git 추적 문서 경로를 우선합니다.
  - `documentPaths.tasksRoot: docs/claude-tasks`
  - `documentPaths.guidelinesRoot: docs/guidelines`
- `.claude/`는 재사용 가능한 규칙/스킬/스크립트 중심으로 유지합니다.
- 템플릿만 나열하지 말고, 가능하면 concrete bootstrap reference package 를 함께 제공합니다.

## 4. 변경 워크플로우

1. 소스 오브 트루스 문서를 먼저 수정합니다.
2. `AGENTS.md` / `.claude/CLAUDE.md`의 링크를 갱신합니다.
3. 핵심 맵/계약 문서의 `Last-Reviewed: YYYY-MM-DD`를 갱신합니다.
4. `.claude/scripts/knowledge-repo-audit.sh`를 실행합니다.
5. 계약 형태가 바뀌면 연결된 downstream reference package 도 함께 갱신합니다.

## 5. 신선도 정책

- 핵심 맵/계약 문서: 45일 주기 검토
- 운영 가이드: 90일 주기 검토
- 로컬 링크 깨짐은 차단 이슈로 처리
- 리뷰 날짜 누락은 백필 전까지 경고로 처리
- 한국어 쌍이 있는 rule 문서는 파일 존재뿐 아니라 구조/내용 parity 도 유지해야 합니다.

## 6. 항상 로드되는 컨텍스트 예산

- `.claude/rules/**/*.md` 라인 수는 예산(기본 `250`) 이하로 유지
- `.claude/CLAUDE.md` + rules 총 라인 수는 예산(기본 `320`) 이하로 유지
- 항상 로드되는 문서의 추정 토큰 예산(기본 `2200`)을 넘지 않도록 유지
- rules 문서는 일반 예시보다 제약 조건 중심으로 유지

## 7. PROJECT 플레이스홀더 정책

- 템플릿 저장소에서는 `PROJECT.md`, `PROJECT.ko.md` 플레이스홀더를 유지할 수 있습니다.
- 실제 프로젝트에서 채움 강제를 원할 때만 아래 옵션을 사용합니다.
  - `KNOWLEDGE_REQUIRE_PROJECT_FILLED=true`
- 강제를 끄면 플레이스홀더는 메트릭에만 기록됩니다.

## 8. 감사 명령

```bash
.claude/scripts/knowledge-repo-audit.sh
```

출력:

- 콘솔 요약
- JSON 아티팩트: `.claude/knowledge-repo-audit-<runId>.json`
- `.claude/rules/**` <-> `.claude/docs/ko/rules/**` 규칙 로컬라이제이션 parity 결과

환경 변수 오버라이드:

- `KNOWLEDGE_REVIEW_MAX_DAYS`
- `KNOWLEDGE_ALWAYS_LOADED_RULE_LINE_MAX`
- `KNOWLEDGE_ALWAYS_LOADED_TOTAL_LINE_MAX`
- `KNOWLEDGE_ALWAYS_LOADED_TOKEN_MAX`
- `KNOWLEDGE_REQUIRE_PROJECT_FILLED`
- `HARNESS_KNOWLEDGE_AUDIT_FILE`
