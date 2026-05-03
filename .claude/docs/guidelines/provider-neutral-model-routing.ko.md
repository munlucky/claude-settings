---
title: Provider-Neutral Model Routing
description: Codex, Claude Code, future provider adapter 공통 모델/effort/reasoning control 정책
lastReviewed: 2026-05-03
---

# Provider-Neutral 모델 라우팅

Moonshot runner는 `stage`, 위험 신호, runtime provider를 기준으로 모델을 자동 선택합니다. 일반 실행에서 사용자가 병렬 worker 모델 수나 단계별 모델명을 직접 고르지 않습니다.

## 공개 계약

- `modelEffortProfile: economy | standard | deep | max`를 안정적인 공개 profile로 유지합니다.
- `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, workflow evidence에 `selectedModelProvider`, `selectedModel`, `selectedModelEffort`, `modelSelectionReason`을 기록합니다.
- `deep`, `max`는 계속 구체적인 `Effort escalation reason`이 필요합니다.
- `MOONSHOT_MODEL_ROUTING=off`는 비상 disable switch입니다.
- `MOONSHOT_FORCE_MODEL=<provider:model>`는 비상 override이며 evidence에 반드시 기록합니다.

## 기본 라우팅

- `economy`: scan, docs-only, status parsing, closeout gate.
- `standard`: 일반 phase implementation과 parallel worker.
- `deep`: review, security, permission, worktree, runtime adapter, state machine, merge conflict, ambiguous dependency, repeated failure.
- `max`: 예외적인 blocker 분석 전용이며 기본 구현 경로로 쓰지 않습니다.

## Runtime 매핑

- Codex/OpenAI는 `-m <model>`과 `model_reasoning_effort`를 받습니다.
- Claude Code는 `--model <alias>`와 `--effort`를 받습니다.
- Gemini와 기타 provider는 같은 route object를 provider adapter capability key로 소비합니다. adapter가 없는 provider는 실행 대상으로 선택하지 않습니다.

모델명은 `.claude/config/model-routing.yaml`에 두어 provider 권장 모델 변화가 있을 때 runner code 수정 없이 갱신합니다.
