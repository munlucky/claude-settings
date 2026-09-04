# Context, prompt, cache, and optimization

- **ID**: `context-prompt-cache-and-optimization`
- **Domain**: `OPTIMIZATION`
- **Family Status**: `CORE`
- **Summary**: bounded context, redaction, prompt envelope, stable cache와 optimization evidence를 관리한다.

## Subcapabilities (Decomplexification 단위)
- **`context-build`** [`CORE`]: 제한된 문맥 빌드 및 민감 정보 마스킹
- **`knowledge-context-selection`** [`CORE`]: 프로젝트 지식 선별 및 주입
- **`context-receipt-freshness`** [`CORE`]: 문맥 바이트 영수증 및 신선도 검증
- **`prompt-envelope`** [`HOST`]: Provider별 프롬프트 와이어 포맷 정규화
- **`prompt-cache`** [`HOST`]: Provider 프롬프트 캐시 브레이크포인트 최적화
- **`optimization-cycle`** [`OPTIONAL`]: 캐시 재생 및 토큰 절감 지표 측정 루프

## 해결하는 문제
- 매 turn마다 큰 context를 재구성해 비용과 latency가 증가하는 문제
- 변경된 source/knowledge에도 stale cache를 재사용하는 문제

## 해결하지 않는 문제
- 모델의 reasoning quality
- cache가 외부 provider에서 실제 hit되었다는 live 보장

## 권장 사용
- context segment에 source identity, digest와 freshness를 기록한다.
- cache replay는 step·task·knowledge·evidence 변경 시 invalidation한다.

## 금지 사용
- raw secret이나 unbounded prompt를 cache에 넣지 않는다.
- cache hit를 execution proof로 취급하지 않는다.

## 재도입 가이드
- **권장 레이어**: context compiler and provider-aware cache
- **트리거**: 새 context segment, prompt provider 또는 optimization policy를 추가할 때
- **통합 지점**:
  - source digest
  - knowledge freshness
  - prompt envelope
  - cache replay
  - usage receipt
- **위험 요소**:
  - stale knowledge leakage
  - secret retention
  - provider envelope drift
  - false evidence from cache hit
- **안전 가드레일**:
  - redaction
  - size/token budget
  - freshness invalidation
  - provider isolation
  - receipt distinction
