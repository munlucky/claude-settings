---
name: session-logger
description: 개발 세션을 실시간으로 기록하여 결정 사항과 이슈를 추적합니다.
---

# Session Logger 스킬

## 공개 범위

이 스킬은 doc-ops helper이면서 지원되는 공개 유틸리티 진입점입니다.
doc-ops bundle 뒤에서 실행할 수도 있고, 사용자가 세션/HANDOFF 기록을 원하면 직접 호출할 수도 있습니다.

> **목적**: 개발 세션을 실시간 기록하여 결정 과정과 시행착오 추적
> **기록 시점**: 작업 시작, 에이전트 전환, 결정, 이슈, 작업 완료
> **출력**: `{tasksRoot}/{feature-name}/session-logs/day-YYYY-MM-DD.md`

---

## 로깅 시점 (자동 트리거)

| 트리거 | 로그 형식 |
|--------|----------|
| 작업 시작 | `## [HH:MM] 작업 시작` + 요청, 브랜치, 초기 분석 |
| 에이전트 전환 | `## [HH:MM] Agent A -> Agent B` + 출력물, 다음 단계 |
| 결정 | `## [HH:MM] 결정: {주제}` + 이유, 대안 |
| 이슈 | `## [HH:MM] 이슈: {문제}` + 원인, 수정, 예방 |
| 완료 | `## [HH:MM] 작업 완료` + 커밋, 검증 |

---

## 세션 로그 템플릿

```markdown
# {YYYY-MM-DD} {feature-name} 세션

## 메타데이터
- 시작/종료: {HH:MM} - {HH:MM}
- 브랜치: {branch}
- 주요 작업: {요약}

## 타임라인
### [HH:MM] 이벤트
- 상세...

## 결정 로그
| 시간 | 결정 | 이유 | 대안 |
|------|------|------|------|

## 이슈 로그
### 이슈 #N: {제목}
- 문제 / 원인 / 수정 / 예방

## Fix Forward 태스크
| 이슈 | 심각도 | 파일 | 제안 | 상태 |
|------|--------|------|------|------|
| {codex-review-code fixForward.tasks[]에서} | HIGH | {파일} | {제안} | ⏳ 대기 |

## 회고
- 잘된 점 / 개선할 점 / 배운 점
```

---

## 세션 핸드오프 (HANDOFF.md)

컨텍스트 윈도우가 80% 초과 시:

1. `analysisContext.artifacts.handoffPath`가 있으면 그 경로를, 없으면 `{tasksRoot}/{feature-name}/HANDOFF.md`를 사용
2. `/clear` 실행
3. 새 세션에서 HANDOFF.md 로드

**HANDOFF.md 템플릿:**
```markdown
# {태스크} - 핸드오프

## 목표
{현재 목표}

## 진행 상황
- 완료: ...
- 효과적: ...
- 실패: ... (이유)

## Fix Forward 태스크 (인계)
| 이슈 | 심각도 | 파일 | 제안 |
|------|--------|------|------|
| {이 세션의 미완료 fix-forward 태스크} |

## 다음 단계
1. 위 fix-forward 태스크 해결 (있는 경우)
2. ...

## 컨텍스트
- 파일: {경로}
- 브랜치: {branch}
- 마지막 커밋: {hash}
```

---

## 파일 구조

```
{tasksRoot}/{feature-name}/
├── HANDOFF.md
└── session-logs/
    ├── day-YYYY-MM-DD.md
    └── ...
```

execution bridge 사용 시:

```
{tasksRoot}/{feature-name}/execution/{slice-name}/
├── SPRINT_CONTRACT.md
├── QA_REPORT.md
└── HANDOFF.md
```

---

## 팁

1. **자동 생성**: 작업 시작 시
2. **실시간 업데이트**: 에이전트 전환 시마다
3. **토큰 제한**: 일일 로그 5000 토큰 이하 유지
4. **재개**: 이전 로그 확인 후 계속

---

## 메모리 연동 (선택)

> MCP Memory 설정 시에만 활성화

| 이벤트 | 키 패턴 | 예시 |
|--------|---------|------|
| 결정 | `decision:{feature}:{topic}` | API 패턴 선택 |
| 진행 | `progress:{feature}` | Phase 1 완료 |
| 해결 | `solution:{issue-type}` | snake_case 수정 |
