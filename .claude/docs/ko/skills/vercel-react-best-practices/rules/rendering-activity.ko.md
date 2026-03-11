# show/hide에는 Activity 컴포넌트 사용

- 화면에서 숨겼다가 다시 보여줄 UI는 unmount/remount보다 상태를 보존하는 패턴이 유리할 수 있습니다.
- Activity 같은 show/hide 전용 컴포넌트는 DOM과 상태를 유지하면서 표시만 제어합니다.
- 탭, 패널, 임시 오버레이처럼 다시 열릴 가능성이 높은 UI에 적합합니다.

