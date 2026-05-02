---
title: GPT-5.5 Cross-Runtime Harness Prompting
description: Codex와 Claude Code 공통 outcome-first, retrieval, validation, phase replay 정책
lastReviewed: 2026-05-02
---

# GPT-5.5 공통 하네스 프롬프팅

Moonshot phase, bounded-direct, runtime-adapter 작업에서 Codex와 Claude Code가 같은 계약으로 동작하게 하는 정책입니다.

## 기본 계약

프롬프트와 실행 계약은 `Goal`, `Success criteria`, `Constraints`, `Output`, `Stop rules`를 먼저 둡니다. 세부 절차는 실제 불변 조건일 때만 강하게 유지합니다.

## Effort

- 기본 `modelEffortProfile`은 `standard`입니다.
- `deep`과 `max`는 runtime/core/architecture/security 위험, 실패 재시도 근거, 장기 고난도 작업일 때만 사용합니다.
- `deep` 또는 `max`를 쓰면 `Effort escalation reason`을 `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `workflowEvidence`에 기록해야 합니다.

## Retrieval

기본 예산은 stage당 compact recall 1회입니다. owner, date, path, API/schema, failure fact가 빠졌을 때만 추가 조회합니다. MemoryGraph와 CodeReviewGraph의 raw output은 prompt나 MemoryGraph에 저장하지 않습니다.

## Validation

검증 profile은 `prompt_only`, `docs_only`, `script_change`, `workflow_core`, `runtime_adapter` 중 하나를 사용합니다. 통과를 위해 benchmark나 verification contract를 약화하지 않습니다.

## Phase Replay

assistant history를 replay하는 adapter는 assistant-item `phase` 값을 그대로 보존합니다. 진행 업데이트는 `commentary`, 완료 답변은 return-boundary 확인 뒤 `final_answer`를 사용합니다. user message에는 `phase`를 추가하지 않습니다.
