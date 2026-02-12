---
name: failure-analyzer
description: 에이전트 실패를 분석하여 시스템 개선점(컨텍스트/스킬/에이전트/규칙 보강)을 도출합니다.
context: fork
---

# Failure Analyzer 스킬

> **목적**: 실패를 시스템 피드백으로 전환. `analysisContext.notes`, `session-logs`를 분석하여 실패 패턴 식별 및 개선 제안.
> **시점**: 다중 실패 발생 시 `moonshot-orchestrator`에 의해 트리거됨.

---

## 입력
- `analysisContext.notes` — 에러 및 결정 로그
- `session-logs` — 최근 활동
- `projectMemory` — 현재 프로젝트 컨텍스트
- `skillChain` — 실행된 스킬 목록

## 실패 카테고리

| 카테고리 | 설명 | 개선 타겟 |
|----------|------|-----------|
| **context_missing** | 정보 부족 | `PROJECT.md`, `rules/*` |
| **tool_missing** | 도구/스크립트 부재 | 새 스킬/스크립트 제안 |
| **skill_logic_error** | 스킬 로직 오류 | `SKILL.md` 로직 수정 |
| **guardrail_missing** | 금지 패턴 반복 위반 | `rules/quality.md`, 경계설정 |
| **prompt_gap** | 프롬프트 시나리오 누락 | `CLAUDE.md`, `AGENT.md` |
| **retry_exhausted** | 재시도 횟수 초과 | `build-error-resolver` DB |

## 분석 워크플로우

1. **로그 스캔**: `notes`에서 에러 신호 검색 (`error`, `failed`, `violation`, `timeout`).
2. **패턴 매칭**: 실패 카테고리와 매칭.
3. **타겟 매핑**: 개선이 필요한 파일/규칙 식별.
4. **제안 수립**: 구체적인 개선 제안 생성.

## 출력 (patch)

```yaml
failureReport:
  totalFailures: 3
  categorized:
    - type: "context_missing"
      description: "에이전트가 API 응답 형식을 계속 틀림"
      evidence: "응답 형식 검증 3회 실패"

systemImprovements:
  # 프로젝트 한정 개선 (PROJECT.md)
  projectSpecific:
    - type: "project_rule"
      file: ".claude/PROJECT.md"
      section: "Core Rules"
      change: "API 응답 형식 명시: { success, data, error }"
      priority: HIGH
      autoApplicable: true

  # 범용 개선 (CLAUDE.md / rules / skills)
  universal:
    - type: "rule_update"
      file: ".claude/rules/coding-style.md"
      change: "규칙 추가: 프로덕션 코드에 console.log 금지"
      priority: HIGH
      autoApplicable: true
    - type: "skill_fix"
      file: ".claude/skills/codex-review-code/SKILL.md"
      change: "새로운 보안 패턴 X 체크 로직 추가"
      priority: MEDIUM
      autoApplicable: false # 로직 변경은 리뷰 필요
```

---

## 개선 타겟

### 프로젝트 레벨 (`.claude/PROJECT.md`)
- **Core Rules**: 프로젝트 전반 불변식
- **API Patterns**: 데이터 형태 및 프로토콜
- **Verification Commands**: 테스트/린트 명령어
- **Directory Structure**: 파일 조직화 기대치

### 범용 레벨 (`.claude/CLAUDE.md`, `.claude/rules/*.md`)
- **Coding Style**: 범용 스타일 가이드
- **Quality/Verification**: 테스팅 표준
- **Security**: 범용 보안 규칙

### 스킬 레벨 (`.claude/skills/*.md`)
- **Logic**: 흐름 수정, 조건 업데이트
- **Prompts**: 지시사항 명확화

---
