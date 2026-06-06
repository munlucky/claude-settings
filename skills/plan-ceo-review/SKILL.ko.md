---
name: plan-ceo-review
description: 실행 전에 planning artifact를 제품 가치, 타이밍, 범위 통제 관점에서 검토합니다.
context: fork
layer: orchestrator
loads:
  - product-artifacts
  - decision-verdict-only
deepReferences:
  - docs/public/guidelines/strategy-gate-rubric.ko.md
  - docs/public/guidelines/product-definition-workflow.md
outputArtifacts:
  - PRODUCT_INTENT.md
  - PRD.md
  - PLAN.md
  - ASSUMPTIONS.md
  - BLOCKERS.md
triggers:
  - "plan ceo review"
  - "scope review"
  - "value review"
---

# Plan CEO Review

## 역할

실행에 들어가기 전에 planning artifact를 제품 가치와 범위 통제 관점에서 검토합니다.
격리된 plan-review 경계에서 실행하고, verdict 요약과 required changes만 병합하는 것을 기본으로 합니다.

이 스킬은 기본적으로 계획 전체를 다시 쓰지 않습니다.
대신 upstream planning 단계가 따라야 하는 결정 verdict를 남깁니다.

## 사용할 때

- 계획은 완성돼 보이지만 범위가 과할 수 있을 때
- 실행 전에 가치나 타이밍 판단이 필요할 때
- 구현 전에 범위를 줄여야 할 가능성이 있을 때

## 입력

- 한 번에 하나의 planning artifact:
  - `PRODUCT_INTENT.md`
  - `PRD.md`
  - `PLAN.md`
- 선택 보조 문맥:
  - `ASSUMPTIONS.md`
  - `BLOCKERS.md`
  - `SPEC.md`

## 검토 질문

1. 왜 지금 이 작업을 해야 하는가?
2. 무엇이 명시적으로 out of scope인가?
3. 예상 구현 비용이 사용자 가치로 정당화되는가?
4. 실행 전에 범위를 줄여야 하는가, 유지해야 하는가, 거절해야 하는가?

## 적용 기준

- 완성된 문서처럼 보여도 why-now 근거가 없으면 부족한 것으로 봅니다.
- 명시적 non-goal과 core success state가 있어야 합니다.
- 가치가 불확실하면 가장 가치가 높은 사용자 경로로 범위를 줄이는 쪽을 우선합니다.
- 관측성, 롤아웃 리스크, 운영 부담도 범위 비용에 포함해 판단합니다.
- 범위를 줄여도 가치가 약하면 `hold_scope` 또는 `fail`을 사용합니다.

## Verdict 계약

아래 중 정확히 하나를 반환합니다.

- `pass`
- `conditional_pass`
- `scope_reduction`
- `hold_scope`
- `fail`

## 출력 형태

```yaml
planCeoReview:
  artifact: "PLAN.md"
  verdict: "scope_reduction"
  summary: "현재 phase 범위가 근시일 가치 대비 넓다."
  requiredChanges:
    - "admin analytics는 후속 slice로 분리"
  assumptions:
    - "이번 실행은 핵심 사용자 경로만 대상으로 함"
  blockers: []
```

## 규칙

- 추측성 확장보다 scope reduction을 우선합니다.
- 완성도를 가치와 동일시하지 않습니다.
- 가치가 약하거나 타이밍이 맞지 않으면 `hold_scope` 또는 `fail`을 사용합니다.
- 비핵심 세부사항이 빠졌다면 `conditional_pass`를 사용합니다.

## 참고

- `.claude/skills/product-orchestrator/SKILL.md`
- `.claude/skills/moonshot-plan-writer/SKILL.md`
