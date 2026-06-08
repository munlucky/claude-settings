---
name: moonshot-orchestrator
description: phase harness가 필요 없고 충분한 컨텍스트가 있는 bounded implementation 작업에 사용합니다.
triggers:
  - "moonshot orchestrator"
  - "bounded implementation"
  - "implement this"
deepReferences:
  - references/bounded-flow.md
  - references/review-and-verification.md
---

# Moonshot Orchestrator

## 역할

phase runner가 필요 없는 경계가 명확한 구현 slice를 실행합니다. 현재 세션이 owner 역할을 유지하고, 변경은 수술적으로 적용하며, 완료는 review와 verification evidence로 증명합니다.

architecture-derived 작업에서는 전체 architecture package가 아니라 bounded selected ADR and traceability slice만 실행합니다.

## 다른 경로로 라우팅

- multi-phase plan, 장시간 harness 작업, staged adoption package는 `moonshot-phase-runner`를 사용합니다.
- 사용자가 아직 제품 범위를 정의하는 단계라면 `product-orchestrator`를 사용합니다.
- non-trivial architecture decision에 대해 accepted architecture package가 없으면 구현 전에 `moonshot-architecture`를 사용합니다.
- 잘못된 가정이 scope, security, data shape, user-visible behavior를 바꿀 때만 clarification으로 멈춥니다.

## Hard Stops

- 사용자 요청 범위를 넓히지 않습니다.
- non-trivial code change에서 code review를 건너뛰지 않습니다.
- stale, missing, smoke-only evidence로 완료를 주장하지 않습니다.
- runtime-state completion authority를 사용할 수 있으면 chat output, markdown report, phase status, verifier JSON만으로 clean finish를 주장하지 않습니다. `scripts/runtime-state.mjs assess-completion`의 accepted DB decision이 필요합니다.
- approval-required operation 또는 protected runtime path 인근 write 전에는 `tools/sandbox/policy.mjs check --json`으로 operation을 분류합니다. unauthorized blocking event가 있으면 clean completion을 멈춥니다.
- 무관한 파일을 변경하거나 사용자 변경을 되돌리지 않습니다.

## Flow

1. 작업이 bounded이고 충분한 컨텍스트가 있는지 확인합니다.
2. architecture package가 제공되면 선택된 `ADR/*.md`, `TRACEABILITY_MATRIX.md`, `PLAN.md`, `ARCHITECTURE_REVIEW.md` path를 소비하고 chat-only summary로 대체하지 않습니다.
3. 편집 전에 local contract와 영향 파일을 확인합니다.
4. 선택된 ADR과 traceability slice를 만족하는 가장 작은 구현을 적용합니다.
5. 집중 검증을 실행하고 실패를 implementation, verification, environment, contract로 분류합니다.
6. review feedback을 반영한 뒤, 변경으로 무효화된 검증만 다시 실행합니다.
7. 변경 파일, 검증, 잔여 리스크를 보고하고 phase-style finalization claim은 하지 않습니다.

## Required Evidence

- 영향 파일 목록과 이유.
- fresh test/build/lint 또는 targeted verification output.
- behavior, shared contract, harness logic이 바뀌면 review evidence.
- 필수 check를 실행할 수 없으면 명시적 blocker classification.

## References

- `references/bounded-flow.md`: stage order, scope control, output contract.
- `references/review-and-verification.md`: review gate, verifier expectation, failure taxonomy.

## Project Knowledge Context Contract

bounded implementation prompt를 만들기 전에 현재 작업 stage에 맞춰 `knowledge-context-build.mjs`의 `projectKnowledgeContext.promptBlock`을 사용합니다. 구현은 `execute`, 검증은 `verify` stage를 사용합니다. worker에는 compact summary block만 전달합니다.

attempt/workflow metadata에는 `status`, `strictness`, `stage`, `blocking`, `unavailableCount`, `knowledgeRevision`만 기록할 수 있습니다. raw MemoryGraph/KG/ontology record, runtime log, transcript, secret-like string은 prompt와 manifest에 넣지 않습니다.
