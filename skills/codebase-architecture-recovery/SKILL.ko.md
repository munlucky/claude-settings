---
name: codebase-architecture-recovery
description: Brownfield 설계 전에 repository evidence로 현재 아키텍처를 복구하는 Moonshot Architecture 내부 stage입니다.
layer: internal
outputArtifacts:
  - CURRENT_ARCHITECTURE.md
  - PRD_FIT_GAP.md
  - IMPACT_MAP.md
  - SPEC_DELTA.md
---

# Codebase Architecture Recovery

## 역할

Brownfield와 Hybrid architecture work가 baseline을 발명하지 않도록 repository evidence에서 현재 아키텍처를 복구합니다.

이 skill은 `moonshot-architecture`의 내부 stage owner이며 public runtime entrypoint가 아닙니다.

## 입력

- Repository files and docs
- Existing tests and runtime contracts
- 현재 PRD/SPEC 또는 change objective
- Owned/read-only/staged path assumptions

## 흐름

1. source evidence에서 current entrypoints, boundaries, data flows, integration points, operational constraints를 식별합니다.
2. 관찰된 architecture와 추론/unknown architecture를 분리합니다.
3. evidence paths와 confidence를 포함해 `CURRENT_ARCHITECTURE.md`를 만듭니다.
4. proposed change에 대한 PRD fit-gap, impact map, spec delta를 만듭니다.
5. implementation handoff를 위한 owned, read-only, staged paths를 선언합니다.

## Hard Stops

- file evidence 없이 current architecture를 발명하지 않습니다.
- 검토한 repository에서 resolve되지 않는 evidence path를 인용하지 않습니다.
- owned path와 read-only path를 흐리지 않습니다.
- compatibility, migration, rollback notes 없이 breaking change를 제안하지 않습니다.
- evidence path를 task owner와 verification signal에 연결한 `SPEC_DELTA.md`, `PLAN.md`, `TRACEABILITY_MATRIX.md` 없이 handoff하지 않습니다.
- source file의 secret-like content를 raw로 포함하지 않습니다.

## Required Evidence

- Evidence paths and observations.
- Current boundaries and runtime flow.
- Fit-gap and impact map.
- Owned/read-only/staged paths.
- Compatibility, migration, rollback notes.
- PLAN task owner and verification signal mapping.
