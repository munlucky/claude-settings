---
name: workflow-self-improver
description: failure-analyzer가 제안한 개선사항을 시스템 프롬프트(CLAUDE.md/rules), 프로젝트 설정(PROJECT.md), 스킬 정의에 적용합니다.
context: fork
---

# Workflow Self-Improver 스킬

> **목적**: "메타 시스템"(프롬프트, 규칙, 스킬)에 개선사항 자동 적용.
> **시점**: `failure-analyzer`가 `systemImprovements`를 생성한 후.

---

## 입력
- `systemImprovements.projectSpecific` — PROJECT.md 개선사항
- `systemImprovements.universal` — CLAUDE.md/규칙/스킬 개선사항

## 실행 모델

### 1. 관찰 (필터링)
개선사항 검토 및 적용 가능성 확인:
- `autoApplicable: true` → 즉시 적용 준비.
- `autoApplicable: false` → `requireApproval` 목록에 추가.

### 2. 적용 (자동)
승인된 변경사항 즉시 적용:

| 타겟 파일 | 액션 | 설명 |
|-----------|------|------|
| `.claude/PROJECT.md` | 섹션 업데이트 | 섹션 끝에 내용 추가 (기존 내용 덮어쓰기 금지) |
| `.claude/rules/*.md` | 규칙 추가 | 기존 파일에 새 규칙 추가 |
| `.claude/CLAUDE.md` | 가이드라인 수정 | 범용 가이드라인 수정 |

### 3. 요청 (수동)
복잡한 변경(스킬 로직, 새 파일)은 태스크/요청 생성:
- `proposal/improvement-{id}.md` 생성
- 출력 통해 사용자 리뷰 요청

## 안전 가드

1. **코드 변경 금지**: 이 스킬은 `.claude/` 설정/규칙만 수정하며, **절대** 소스 코드를 수정하지 않음.
2. **백업**: 수정 전 타겟 파일 백업 (메모리 또는 임시 파일).
3. **검증**: 적용 가능한 경우 수정 후 YAML 유효성 확인.
4. **스킬 로직 잠금**: `SKILL.md` 파일 수정은 **항상** `autoApplicable: false` (수동 리뷰) 필요.

## 출력 (patch)

```yaml
selfImprovementResult:
  applied:
    - file: ".claude/PROJECT.md"
      change: "API 응답 형식 규칙 추가됨"
    - file: ".claude/rules/coding-style.md"
      change: "console.log 금지 규칙 추가됨"
  pendingApproval:
    - file: ".claude/skills/codex-review-code/SKILL.md"
      change: "보안 체크 로직 업데이트"
      reason: "스킬 로직 변경은 리뷰 필요"
```

---

## 롤백 전략

적용 실패 시:
1. 백업에서 복원
2. `notes`에 에러 기록
3. 항목을 `pendingApproval` 목록으로 이동

---
