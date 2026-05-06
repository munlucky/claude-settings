---
name: harness-memory-promoter
description: 승인된 범용 프로젝트 지식을 claude-settings 하네스 MemoryGraph로 승격합니다.
triggers:
  - "하네스 메모리 승격"
  - "메모리 후보 승격"
  - "범용 지식 승격"
---

# 하네스 메모리 승격

사용자가 프로젝트 지식 중 재사용 가능한 내용을 하네스 graph로 승격하라고 명시 승인했을 때 사용합니다.
승격은 replay 증거 또는 human approval로 게이트되며, 결과 fact는 provenance 태그를 포함한 compact 형태여야 합니다.

## 필수 흐름

1. `claude-settings` 저장소 루트에서 실행합니다.
2. source 프로젝트의 `.claude/cache/memorygraph/promotion-candidates.json`을 읽습니다.
3. 프로젝트 고유 도메인 사실, 일회성 세부사항, secrets, `.claude/docs/ko/` 기반 사실을 제외합니다.
4. `harness-memory-promoter`를 `approval: approved`로 호출합니다.
5. 승인된 항목은 다음 태그로 저장합니다.
   - `project:claude-settings`
   - `source:moonshot`
   - `origin:awtl`
   - `origin_turn:{turnId}`
   - `origin_run:{runId}`
   - `origin_candidate:{candidateId}`
   - `validated_by:{method}`

## AWTL 승격 계약

- failed-turn candidate는 `failure_turn_id`를 포함해야 합니다.
- 직접 write에는 `--write-memorygraph`가 필요합니다. 없으면 올바른 `write_status`는 `not_requested` 또는 `skipped`입니다.
- `--auto-promote verified-only`만 자동 write policy입니다. 그 외에는 명시적 human approval이 필요합니다.
- 각 결정은 replay scorecard에 `denial_codes`, `write_status`, `applies_to`, `does_not_apply_to`, `validated_by`, `last_validated_at`와 함께 append합니다.
- `imported_only`, `transcript_only`, `raw_trace_payload`, `missing_failure_turn_id`, `invalid_candidate`, `memorygraph_unavailable`에 해당하는 후보는 거부합니다.

## 강제 규칙

- source 프로젝트에서 하네스 graph에 직접 쓰지 않습니다.
- raw project graph dump를 승격하지 않습니다.
- 승격 memory는 짧고 재사용 가능해야 합니다.
- MemoryGraph가 불가하면 실패를 보고하되 관련 없는 작업은 막지 않습니다.
- transcript-only 또는 imported-only 후보는 승격하지 말고, environment/flaky/harness blocker는 유지합니다.
- MemoryGraph unavailable을 성공으로 취급하지 않습니다. 이는 promotion write skip/failure이지 전체 workflow blocker가 아닙니다.
