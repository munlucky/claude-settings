---
name: failure-analyzer
description: 실패를 분석해 시스템 개선점(컨텍스트/스킬/규칙/계약)을 도출한다.
context: fork
surfaceStatus: internal_stage_owner
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

## Systematic Debugging 규칙

- root-cause evidence를 기록하기 전에는 수정안을 제안하지 않습니다.
- 증상이 반복되면 반대 증거가 나오기 전까지 같은 `failureClass`로 취급합니다.
- 같은 `failureClass`가 두 번 나오면 다음 retry 전에 tactic을 바꿉니다.
- 세 번 실패하면 local fix를 계속하지 말고 design/contract review로 승격합니다.

## 분석 흐름
1. 로그에서 실패 신호를 읽는다.
2. 카테고리에 매핑하고 `failureClass`를 지정한다.
3. 표면 증상이 아니라 가장 강한 root-cause evidence를 찾는다.
4. 같은 `failureClass`에 대한 이전 수정 시도 횟수를 센다.
5. 어떤 파일/규칙/스킬/계약을 고쳐야 하는지 찾는다.
6. 반복 실패라면 다른 tactic을 제안한다.

## 출력 필드

```yaml
failureReport:
  failureClass: "verification_contract_missing"
  rootCauseEvidence:
    - "완료 주장 전 검증 명령이 기록되지 않음"
  attemptedFixes:
    - "검증 계약 변경 없이 구현만 재시도"
  sameFailureClassCount: 2
  nextTactic: "구현 재시도 전에 contract 정의로 복귀"
```

## 개선 타겟
- 프로젝트 레벨: `PROJECT.md`, 검증 명령, 구조 규칙
- 범용 레벨: `.claude/rules/*.md`, `.claude/docs/guidelines/*.md`
- 스킬 레벨: 라우팅, readiness gate, contract 문서, 스킬 로직
