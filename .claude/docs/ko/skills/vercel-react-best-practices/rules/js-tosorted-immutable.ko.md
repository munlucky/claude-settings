# 불변성을 위해 sort 대신 toSorted 사용

- React 상태나 props 기반 배열을 정렬할 때 원본을 mutate하는 `sort()`를 피합니다.
- `toSorted()`는 새 배열을 반환해 상태 오염과 예측 불가 버그를 줄입니다.
- 환경 지원이 부족하면 `[...arr].sort()`를 사용합니다.

