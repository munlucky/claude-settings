---
name: architecture-gate-reviewer
description: architecture package가 구현 handoff 준비 상태인지 검토하는 Moonshot Architecture 내부 stage입니다.
layer: internal
outputArtifacts:
  - ARCHITECTURE_REVIEW.md
  - TRACEABILITY_MATRIX.md
  - PLAN.md
---

# Architecture Gate Reviewer

## 역할

구현 handoff 전에 architecture package를 검토하고, 필수 evidence가 없으면 readiness claim을 차단합니다.

이 skill은 `moonshot-architecture`의 내부 stage owner이며 public runtime entrypoint가 아닙니다.

## 입력

- Architecture package artifacts
- Validator output
- Traceability matrix
- Handoff target과 planned owned/read-only/staged paths
- architecture-heavy 작업이 project knowledge, KG, ontology, knowledgeAnchors에 의존하면 `APPLICABLE_KNOWLEDGE_SLICE`
- execution handoff를 contract-bound로 만들 때 `ARCHITECTURE_CONTRACT_SLICE`와 `ARCHITECTURE_HANDOFF`

## 흐름

1. 선택된 mode의 required artifacts를 확인합니다.
2. validator output과 unresolved structural errors를 확인합니다.
3. requirements에서 ASRs, ADRs, owners, verification signals까지 traceability를 확인합니다.
4. 해당하는 경우 Brownfield compatibility, migration, rollback evidence를 확인합니다.
5. architecture-heavy 작업은 implementation handoff 전에 contract slice와 handoff status를 확인합니다.
6. concrete findings와 함께 pass, needs-more-evidence, block 중 하나를 반환합니다.

## Hard Stops

- `architecture-artifact-validate.mjs`가 실패한 package를 승인하지 않습니다.
- owners와 verification signals 없는 implementation handoff를 승인하지 않습니다.
- `ARCHITECTURE_CONTRACT_SLICE`와 `ARCHITECTURE_HANDOFF` 없는 architecture-heavy implementation handoff를 승인하지 않습니다.
- blocked `ARCHITECTURE_HANDOFF` 또는 selected constraints, path boundaries, verification signals가 빠진 handoff를 승인하지 않습니다.
- blocking ontology constraint가 contract에 없거나 enforcement rule이 없으면 handoff를 승인하지 않습니다.
- review notes를 runtime-state completion authority로 취급하지 않습니다.
- blocker findings를 summary text 안에 숨기지 않습니다.

## Required Evidence

- Review status.
- Artifact path가 포함된 findings.
- Validator output reference.
- Handoff readiness decision과 residual risks.
