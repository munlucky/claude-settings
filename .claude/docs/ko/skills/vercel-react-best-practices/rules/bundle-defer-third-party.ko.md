# 비핵심 서드파티 라이브러리 지연 로드

- analytics, logging, error tracking은 사용자 인터랙션을 막지 않아야 합니다.
- hydration 이후에 로드하도록 분리하면 초기 번들을 가볍게 유지할 수 있습니다.
- `next/dynamic`과 `ssr: false` 조합이 대표적인 방법입니다.

