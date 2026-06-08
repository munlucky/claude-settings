---
name: asr-extractor
description: 정규화된 요구사항에서 ASR과 품질속성 시나리오를 추출하는 Moonshot Architecture 내부 stage입니다.
layer: internal
outputArtifacts:
  - ASR_CATALOG.md
  - QUALITY_ATTRIBUTE_SCENARIOS.md
  - TRACEABILITY_MATRIX.md
---

# ASR Extractor

## 역할

`REQUIREMENT_INVENTORY.md`, PRD 근거, Brownfield 제약에서 architecturally significant requirement를 추출합니다.

이 skill은 `moonshot-architecture`의 내부 stage owner이며 public runtime entrypoint가 아닙니다.

## 입력

- `REQUIREMENT_INVENTORY.md`
- PRD, SPEC, 또는 Brownfield evidence summary
- 알려진 제약, 리스크, 품질속성

## 흐름

1. 구조, runtime behavior, data boundary, security, performance, reliability, operability, integration contract에 영향을 주는 요구사항을 고릅니다.
2. `ASR-001` 형식 ID를 부여하고 각 ASR을 하나 이상의 `REQ-001` 형식 ID에 연결합니다.
3. stimulus, environment, response, response measure를 포함한 품질속성 시나리오를 작성합니다.
4. 제품상 중요하지만 architecture-significant하지 않은 후보는 rejected ASR candidate로 남깁니다.
5. 이후 option generation과 ADR/C4 writing에서 사용할 traceability link를 유지합니다.

## Hard Stops

- 모든 요구사항을 ASR로 표시하지 않습니다.
- requirement ID 없이 ASR을 만들지 않습니다.
- source가 침묵하는 품질 측정값을 발명하지 않습니다. gap으로 명시합니다.
- raw MemoryGraph, KG, ontology, log, transcript, browser, secret-like data를 노출하지 않습니다.

## Required Evidence

- Source requirement IDs.
- ASR IDs와 rationale.
- Quality attribute scenarios.
- 각 ASR의 verification signal 또는 explicit verification gap.
