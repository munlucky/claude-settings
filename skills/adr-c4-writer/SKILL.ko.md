---
name: adr-c4-writer
description: accepted architecture decision에서 C4 model artifact와 ADR을 작성하는 Moonshot Architecture 내부 stage입니다.
layer: internal
outputArtifacts:
  - C4/C4_CONTEXT.md
  - C4/C4_CONTAINER.md
  - C4/C4_COMPONENT.md
  - ADR/*.md
  - TRACEABILITY_MATRIX.md
---

# ADR C4 Writer

## 역할

accepted architecture decision에서 C4 model artifact와 Architecture Decision Record를 작성합니다.

이 skill은 `moonshot-architecture`의 내부 stage owner이며 public runtime entrypoint가 아닙니다.

## 입력

- `TRADEOFF_ANALYSIS.md`
- 선택된 architecture option
- Requirement IDs, ASR IDs, verification signals
- 가능한 경우 Brownfield current architecture evidence

## 흐름

1. architecture template이 선언한 output path에 C4 context, container, component artifact를 작성합니다.
2. 중요한 accepted decision마다 `ADR/ADR-0001-title.md` 아래에 ADR을 작성합니다.
3. 각 ADR에 context, decision, consequences, rejected alternatives, traceability를 기록합니다.
4. C4 element와 ADR을 requirements, ASRs, verification signals에 연결합니다.
5. Diagram은 markdown 또는 mermaid source로 검토 가능하게 유지합니다.

## Hard Stops

- rejected alternatives 없는 ADR을 작성하지 않습니다.
- 명확한 system boundary 없이 C4 coverage를 주장하지 않습니다.
- source template path와 generated output path를 혼동하지 않습니다.
- ADR에서 traceability를 생략하지 않습니다.

## Required Evidence

- C4 artifact paths.
- ADR IDs와 decision status.
- Requirement와 ASR links.
- Consequences, rejected alternatives, verification signals.
