# 함수형 setState 업데이트 사용

- 현재 상태를 바탕으로 새 상태를 만드는 경우 `setState(curr => ...)` 형태를 사용합니다.
- stale closure를 막고 callback dependency를 줄여 안정적인 참조를 만들 수 있습니다.
- `useCallback` 안에서 상태를 읽어야 할 때 기본 선택지로 생각하면 됩니다.

