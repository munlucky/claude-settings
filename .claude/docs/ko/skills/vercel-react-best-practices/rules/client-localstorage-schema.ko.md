# localStorage 데이터 최소화와 버전 관리

- localStorage 키에는 버전을 포함하고, 실제 UI에 필요한 필드만 저장합니다.
- 전체 서버 응답이나 민감한 데이터, 내부 플래그를 그대로 저장하지 않습니다.
- `getItem`/`setItem`은 private mode, quota 초과 등에서 예외가 날 수 있으므로 `try/catch`로 감쌉니다.

