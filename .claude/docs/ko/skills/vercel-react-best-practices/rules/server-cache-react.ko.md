# React.cache()로 요청 내부 dedup

- 같은 요청 안에서 반복되는 인증, DB 조회, 무거운 비동기 작업은 `React.cache()`로 dedup합니다.
- 단, 인라인 객체 인자는 매번 새 참조라 cache hit를 깨뜨릴 수 있습니다.
- `fetch`는 Next.js가 자체 메모이제이션하므로 주로 non-fetch async 작업에 집중합니다.

