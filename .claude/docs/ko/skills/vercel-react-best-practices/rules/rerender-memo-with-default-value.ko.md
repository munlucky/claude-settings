# memo 컴포넌트의 비원시 기본값은 상수로 분리

- memoized 컴포넌트의 기본 prop 값으로 함수, 배열, 객체 리터럴을 직접 쓰면 매 렌더마다 새 참조가 생깁니다.
- 기본값은 `NOOP`, `EMPTY_ARRAY`, `DEFAULT_OPTIONS` 같은 상수로 분리합니다.
- 그래야 `memo()`의 strict equality 비교가 깨지지 않습니다.

