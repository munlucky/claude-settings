---
name: plan-eng-review
description: 실행 전에 planning artifact를 아키텍처 무결성, 의존성 구조, 실행 준비성 관점에서 검토합니다.
context: fork
layer: orchestrator
loads:
  - plan-artifacts
  - architecture-contracts
deepReferences:
  - .claude/docs/guidelines/strategy-gate-rubric.ko.md
  - .claude/docs/guidelines/verification-contract.md
  - .claude/docs/guidelines/skill-composition.md
outputArtifacts:
  - SPEC.md
  - PLAN.md
  - tasks/*.md
triggers:
  - "plan eng review"
  - "architecture review"
  - "execution readiness review"
---

# Plan ENG Review

## 역할

구현에 들어가기 전에 planning artifact를 기술적 일관성 관점에서 검토합니다.
격리된 plan-review 경계에서 실행하고, verdict 요약, required changes, blockers만 병합하는 것을 기본으로 합니다.

이 스킬은 계획이 숨겨진 아키텍처 공백 없이 실행 가능한지 확인합니다.

## 사용할 때

- `SPEC.md`가 있고 구현이 임박했을 때
- `PLAN.md` 또는 `tasks/*.md`에 의존성 공백이 있을 수 있을 때
- 교차 계층 또는 다중 소유자 작업에 기술 경계 검토가 필요할 때

## 검토 질문

1. 책임과 인터페이스가 구현 가능할 만큼 명확한가?
2. 의존성과 순서가 명시돼 있는가?
3. 계획된 작업의 검증 경로가 정의돼 있는가?
4. 숨은 결합이나 아키텍처 드리프트를 피하고 있는가?

## 적용 기준

- 구현 중 큰 숨은 발명에 의존하는 계획은 통과시키지 않습니다.
- 경계, 인터페이스, 의존 순서의 소유권이 명시돼야 합니다.
- 구체적인 verification 경로가 없으면 `pass`를 주지 않습니다.
- 암묵 결합이 크거나 rollback 리스크를 무시하면 verdict를 낮춥니다.
- 범위를 줄이면 기술적으로 일관돼지는 경우 `scope_reduction`을 우선합니다.

## Verdict 계약

아래 중 정확히 하나를 반환합니다.

- `pass`
- `conditional_pass`
- `scope_reduction`
- `hold_scope`
- `fail`

## 출력 형태

```yaml
planEngReview:
  artifact: "SPEC.md"
  verdict: "conditional_pass"
  summary: "구현 가능하지만 API 소유권과 검증 명령이 더 명확해야 한다."
  requiredChanges:
    - "API boundary owner 정의"
    - "task slice별 verification command 지정"
  blockers: []
```

## 규칙

- 실행 중 큰 숨은 발명을 요구하는 계획은 통과시키지 않습니다.
- 암묵 조율보다 명시적 boundary ownership을 우선합니다.
- verification이 정의되지 않았다면 `pass`를 주지 않습니다.
- 기술 리스크의 원인이 과한 범위라면 `scope_reduction`을 사용합니다.

## 참고

- `.claude/skills/product-orchestrator/SKILL.md`
- `.claude/skills/moonshot-plan-writer/SKILL.md`
