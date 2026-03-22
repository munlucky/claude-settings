# 스크롤 성능을 위한 passive event listener

- `touchstart`, `wheel` 같은 스크롤 관련 리스너는 가능하면 `{ passive: true }`를 사용합니다.
- 브라우저가 `preventDefault()` 가능성을 기다리지 않아 스크롤 지연을 줄일 수 있습니다.
- 직접 제스처를 막아야 하는 경우에는 passive를 사용하면 안 됩니다.

