# 요청 간 LRU 캐시

- `React.cache()`는 단일 요청 내부 dedup에만 유효합니다.
- 연속된 여러 요청에서 재사용할 데이터는 LRU 캐시 같은 cross-request 캐시를 고려합니다.
- Fluid Compute 환경에서는 특히 효과가 좋고, 전통적 서버리스에서는 외부 캐시가 더 적합할 수 있습니다.

