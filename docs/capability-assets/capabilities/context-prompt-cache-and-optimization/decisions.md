# Decisions & Failure History: Context, prompt, cache, and optimization

- **Status**: `CORE`
- **Disposition**: `retain`

## 설계 및 보존 결정
비용과 재현성을 함께 다루는 현재 CORE capability이며 knowledge와 evidence boundary를 보강한다.

### 후속 조치
- optimization 변경은 context byte identity와 cache invalidation 회귀를 함께 갱신한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E6 (`9e929f98037bc427a7707dbf844568d3eb39d99f`, 2026-07-30)
- **Generations**:
  - **context-receipt** (E4, `7806dd1870501a1171969ca8e13af8fbec26f892`): Kernel context - context build와 receipt를 Kernel execution surface에 도입했다.
  - **shared-model-optimization** (E6, `9e929f98037bc427a7707dbf844568d3eb39d99f`): Shared optimization - stable context와 model execution optimization을 추가했다.
  - **cache-replay** (E7, `30b317c0c8f0dee9b4a1c8f82f8b14fe30a7f692`): Cache replay - prompt/cache segment reuse와 invalidation 조건을 구조화했다.
  - **current-fresh-context** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Fresh context - redaction, digest, freshness와 context boundary를 owner-direct execution에 연결했다.

## 알려진 결함 및 교훈 (Known Failures)
### stale-context-replay (P1)
- **현상**: source, step 또는 project knowledge가 바뀌었는데 이전 prompt/cache segment가 재사용될 수 있었다.
- **원인**: cache key와 evidence freshness inputs가 충분히 바인딩되지 않았다.
- **교훈**: content digest, task/step/knowledge identity와 provider envelope를 cache lineage에 포함한다.
- **수정 커밋**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **회귀 테스트**: `tests/kernel-cache-replay.test.mjs`, `tests/kernel-cache-summary.test.mjs`, `tests/kernel-context-byte-identity.test.mjs`
