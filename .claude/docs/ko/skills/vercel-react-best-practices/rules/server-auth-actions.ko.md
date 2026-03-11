# Server Action도 API Route처럼 인증

- `"use server"` 함수는 사실상 공개 엔드포인트처럼 취급해야 합니다.
- middleware나 layout guard만 믿지 말고, 각 Server Action 내부에서 인증과 권한 검사를 수행합니다.
- 입력 검증까지 함께 하면 안전성이 더 올라갑니다.

