# ASR Extraction Guideline

Architecturally significant requirement는 구조, integration boundary, runtime behavior, data ownership, operational constraint, verification strategy에 영향을 주는 요구사항입니다.

Architecture option을 만들기 전에 accepted requirement에서 ASR을 추출합니다.

각 ASR은 stable ID, source requirement link, quality attribute classification, scenario, expected verification signal, unresolved assumptions를 가져야 합니다.

모든 기능 요구사항을 ASR로 취급하지 않습니다. Architecture 결정에 영향을 주는 요구사항에 집중합니다.

Brownfield 작업에서는 각 ASR이 기존 architecture constraint를 preserve, extend, conflict 중 무엇으로 다루는지 기록합니다.

non-trivial 작업에서 ASR extraction이 없으면 implementation handoff를 막습니다.
