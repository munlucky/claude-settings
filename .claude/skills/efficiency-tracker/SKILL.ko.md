---
name: efficiency-tracker
description: Tracks workflow execution and generates flow reports with actionable insights.
triggers:
  - "analyze workflow"
  - "generate insights"
  - "workflow insights"
---

# Efficiency Tracker Skill

## 역할
작업 흐름 상태를 기록하고 아래 산출물을 생성합니다.
- 흐름 리포트 (타임라인, 블로킹, 검증 결과, 커밋 링크)
- 인사이트 리포트 (규칙 업데이트 제안, 워크플로우 최적화 권고)

## 입력
- 기능명: `{feature-name}`
- 모드: `report`(기본값) | `generate-insights`
- Phase/브랜치 정보(선택)
- 검증 명령 결과 로그(선택)
- **개선 메트릭** (from failure-analyzer/workflow-self-improver):
  - `failureReport` (통계)
  - `selfImprovementResult` (적용된 변경사항)

## 동작
### 1) `report` 모드
1. 시작/종료 타임스탬프, 활성 Phase를 기록.
2. 블로킹 구간(예: 화면 정의서 확인 대기, API 스펙 대기)을 메모로 추가.
3. 실행한 검증 명령(typecheck/build/lint 등)과 결과를 기록.
4. 변경 파일/커밋 링크와 작성자 메모를 남김.
5. **메타 시스템 이벤트 기록**:
   - 실패 카테고리 및 빈도 기록.
   - 적용된 시스템 개선사항 기록 (예: "PROJECT.md 규칙 업데이트됨").
6. `{tasksRoot}/{feature-name}/flow-report.md`에 append 또는 생성.

### 2) `generate-insights` 모드
1. 최신 `flow-report.md`와 최근 검증 결과를 로드.
2. Phase/카테고리/명령 단위의 반복 실패 패턴을 탐지.
3. 패턴을 실행 가능한 제안으로 변환:
   - 규칙 업데이트 (`PROJECT.md`, `.claude/rules/*`)
   - 체인 조정 (`moonshot-*` runner/orchestrator)
   - 검증 개선 (체크 추가, 순서 조정, 재시도 전략)
4. 영향도/구현난이도 기준으로 우선순위화.

## 출력
- `flow-report.md` 업데이트 로그 (`report` 모드)
- 인사이트 섹션 (`generate-insights` 모드):
  - 근본 원인 요약
  - 규칙 업데이트 제안
  - 워크플로우 개선 권고
  - 다음 실행 실험 계획 (최대 3개)
- 필요 시 session-log/day-...에 타임라인 항목 추가

## 실행 스니펫
```
작업 흐름 리포트를 업데이트하거나 인사이트를 생성해줘.
- 기능: {featureName}
- 모드: {mode}
- Phase: {phase}
- 블로킹 메모: {blockingNotes}
- 검증 결과: {verifyResults}
- 커밋/파일: {commitRefs}
출력: flow-report.md 업데이트 또는 인사이트 권고
```

## 토큰 한도
- **`.claude/docs/guidelines/document-memory-policy.md` 참조**: flow-report.md는 4000 토큰 이하로 유지
- 한도 초과 시 오래된 항목 아카이빙
