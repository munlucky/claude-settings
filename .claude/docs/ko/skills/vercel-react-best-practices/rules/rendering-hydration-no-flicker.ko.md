# 깜빡임 없는 hydration mismatch 방지

- client-only 값 때문에 hydration mismatch가 생길 때, 첫 렌더와 hydration 후 UI 점프를 최소화해야 합니다.
- placeholder -> 실제 값 치환 과정에서 깜빡임이 크면 inline script나 초기 상태 주입을 고려합니다.
- 목표는 "hydration 에러를 피하면서도 시각적 점프를 줄이는 것"입니다.

