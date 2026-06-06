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
- `correction_lesson`
- `failed_turn_prevention_gap`

## Systematic Debugging 규칙

- root-cause evidence를 기록하기 전에는 수정안을 제안하지 않습니다.
- 증상이 반복되면 반대 증거가 나오기 전까지 같은 `failureClass`로 취급합니다.
- 같은 `failureClass`가 두 번 나오면 다음 retry 전에 tactic을 바꿉니다.
- 세 번 실패하면 local fix를 계속하지 말고 design/contract review로 승격합니다.
- 사용자 correction은 단발 선호와 재사용 가능한 workflow 실수로 구분한 뒤 durable rule/skill 변경 여부를 판단합니다.
- 재사용 가능한 correction lesson은 짧게 기록하고, 모든 correction을 새 규칙으로 만들지는 않습니다.
- capture된 실패에 turn id가 있으면 output에 `failure_turn_id`를 유지하고 raw trace payload 대신 redacted evidence ref를 인용합니다.
- replay scorecard가 stale, risky, denied, unverified로 표시한 prevention hint는 재사용하지 않습니다.

## 분석 흐름
1. 로그에서 실패 신호를 읽는다.
2. 카테고리에 매핑하고 `failureClass`를 지정한다.
3. 표면 증상이 아니라 가장 강한 root-cause evidence를 찾는다.
4. 같은 `failureClass`에 대한 이전 수정 시도 횟수를 센다.
5. 어떤 파일/규칙/스킬/계약을 고쳐야 하는지 찾는다.
6. 반복 실패라면 다른 tactic을 제안한다.
7. 사용자 correction이 trigger였다면 재사용 가능 여부, 기록 위치, rule/skill 변경 필요 여부를 판단한다.
8. turn-scoped 실패라면 capture, failed turn case 생성, next-run brief matching, MemoryGraph promotion policy 중 어디를 고쳐야 하는지 지정한다.

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
  correctionLesson:
    reusable: true
    summary: "최신 verifier evidence 없이 완료를 주장함"
    logTarget: "analysisContext.notes"
    durableTarget: ".moonshot-relay/docs/solutions/"
    ruleOrSkillChangeJustified: true
  turnFailure:
    failure_turn_id: "turn-phase05-attempt01"
    failedTurnCasePath: ".claude/cache/awtl/failed_turn_cases.jsonl"
    preventionHintTarget: "phase-runner failure prevention brief"
    replayScorecardStatus: "verified|denied|stale|risky|not_checked"
```

## 개선 타겟
- 프로젝트 레벨: `PROJECT.md`, 검증 명령, 구조 규칙
- 범용 레벨: `.claude/rules/*.md`, `docs/public/guidelines/*.md`
- 스킬 레벨: 라우팅, readiness gate, contract 문서, 스킬 로직
