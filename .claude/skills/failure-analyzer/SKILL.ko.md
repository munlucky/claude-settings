---
name: failure-analyzer
description: 실패를 분석해 시스템 개선점(컨텍스트/스킬/규칙/계약)을 도출한다.
context: fork
---

# Failure Analyzer 스킬

## 목적
`analysisContext.notes`, `session-logs`, tool 출력에서 실패 패턴을 찾아 시스템 개선 제안으로 바꾼다.

## 실패 카테고리
- `context_missing`
- `tool_missing`
- `skill_logic_error`
- `guardrail_missing`
- `prompt_gap`
- `retry_exhausted`
- `execution_plane_mismatch`
- `readiness_gate_missing`
- `verification_contract_missing`

## 분석 흐름
1. 로그에서 실패 신호를 읽는다.
2. 카테고리에 매핑한다.
3. 어떤 파일/규칙/스킬을 고쳐야 하는지 찾는다.
4. 구체적인 개선 제안을 만든다.

## 개선 타겟
- 프로젝트 레벨: `PROJECT.md`, 검증 명령, 구조 규칙
- 범용 레벨: `.claude/rules/*.md`, `.claude/docs/guidelines/*.md`
- 스킬 레벨: 라우팅, readiness gate, contract 문서, 스킬 로직
