# 안정적인 callback ref를 위한 useEffectEvent

- 최신 값에 접근하려고 dependency 배열을 불필요하게 늘리지 말고 `useEffectEvent`를 사용합니다.
- 이렇게 하면 stale closure를 피하면서 effect 재실행도 줄일 수 있습니다.
- 입력 핸들러, debounce, timeout 기반 effect에 특히 유용합니다.

