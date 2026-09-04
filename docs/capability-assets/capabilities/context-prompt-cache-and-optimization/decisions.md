# Capability Decisions: Context, prompt, cache, and optimization

- **Capability ID**: `context-prompt-cache-and-optimization`
- **Disposition**: `retain`
- **Subcapabilities Count**: 6

## Rationale
비용과 재현성을 함께 다루는 현재 CORE capability이며 knowledge와 evidence boundary를 보강한다.

## Subcapabilities Allocation
- **Context build** (`context-build`): `CORE` — 제한된 문맥 빌드 및 민감 정보 마스킹
  - Implementations: 2 files bound
  - Proofs: context-compiler
- **Knowledge context selection** (`knowledge-context-selection`): `CORE` — 프로젝트 지식 선별 및 주입
  - Implementations: 2 files bound
  - Proofs: context-compiler
- **Context receipt freshness** (`context-receipt-freshness`): `CORE` — 문맥 바이트 영수증 및 신선도 검증
  - Implementations: 1 files bound
  - Proofs: context-byte-identity
- **Prompt envelope** (`prompt-envelope`): `HOST` — Provider별 프롬프트 와이어 포맷 정규화
  - Implementations: 2 files bound
  - Proofs: context-byte-identity
- **Prompt cache** (`prompt-cache`): `HOST` — Provider 프롬프트 캐시 브레이크포인트 최적화
  - Implementations: 1 files bound
  - Proofs: cache-replay
- **Optimization cycle** (`optimization-cycle`): `OPTIONAL` — 캐시 재생 및 토큰 절감 지표 측정 루프
  - Implementations: 2 files bound
  - Proofs: cache-replay

## Follow-up Directives
- optimization 변경은 context byte identity와 cache invalidation 회귀를 함께 갱신한다.
