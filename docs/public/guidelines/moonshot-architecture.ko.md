# Moonshot Architecture Guideline

`moonshot-architecture`는 product definition과 implementation execution 사이의 architecture design stage입니다.

PRD, 기존 repository, harness 개선 목표가 구현 전에 아키텍처 결정과 traceability를 필요로 할 때 사용합니다.

non-trivial 작업의 필수 산출물은 requirement inventory, ASR catalog, quality attribute scenarios, architecture options, trade-off analysis, ADR, 필요한 C4 view, traceability matrix입니다.

Brownfield 작업은 새 구조를 제안하기 전에 repository evidence로 현재 architecture를 복구해야 합니다.

Phase prompt는 `scripts/architecture-context-build.mjs`로 구성합니다. Prompt-facing authority는 `architectureContext.promptBlock`이며, project knowledge는 `projectKnowledgeContext.promptBlock`과 status metadata만 붙일 수 있습니다.

## Project-Local Knowledge Anchors

대상 project의 root `AGENTS.md`에 `knowledgeAnchors`가 있으면, `moonshot-architecture`는 mode classification 이후 package 생성 전에 적용 가능한 anchor를 확인합니다.

Anchor는 항상 로드되는 discovery metadata입니다. Anchor 자체에는 compact summary, package path, start document, 적용 조건만 둡니다. 세부 agreement 문서는 현재 architecture scope에 필요한 것만 선택적으로 읽습니다.

Architecture package에는 확인한 anchor ID, 사용한 agreement path, 사용하지 않은 anchor가 있다면 그 이유를 `ARCHITECTURE_BRIEF.md` 또는 `ARCHITECTURE_REVIEW.md`에 남깁니다.

Moonshot Relay canonical source에는 project-specific anchor를 넣지 않습니다. Project별 anchor는 해당 project의 `AGENTS.md`와 `.moonshot-relay/docs/agreements/**`에 둡니다.

Project knowledge namespace가 advisory mode에서 unavailable이면 architecture context status를 degraded로 남기고 명시적인 evidence와 함께 계속합니다. 없는 current-state fact를 암묵적으로 만들어내지 않습니다.

Architecture package에는 raw MemoryGraph record, KG dump, ontology dump, runtime log, transcript, browser scrape, secret-like string을 넣지 않습니다.

Architecture design 중 live `.claude/**`, `.codex/**`, account-root state, runtime profile을 mutate하지 않습니다. Controlled adoption은 명시적인 execution phase에서만 다룹니다.

## Handoff Contract

Architecture package는 문서 본문 복사가 아니라 path로 handoff합니다. Downstream workflow는 아래를 소비합니다.

- `TRACEABILITY_MATRIX.md`
- 선택된 `ADR/*.md`
- `ARCHITECTURE_REVIEW.md`
- task owner와 verification signal이 있는 `PLAN.md`
- 기존 시스템 evidence가 필요한 Brownfield 작업의 `CURRENT_ARCHITECTURE.md`, `PRD_FIT_GAP.md`, `IMPACT_MAP.md`, `SPEC_DELTA.md`

`product-orchestrator`는 architecture-heavy PRD를 implementation planning 전에 여기로 라우팅합니다. `moonshot-plan-writer`는 accepted package row를 phase metadata에 매핑합니다. `moonshot-orchestrator`는 bounded selected ADR/traceability slice를 실행할 수 있습니다. `moonshot-phase-runner`는 multi-phase, staged adoption, long-running architecture-derived plan을 소유합니다.
