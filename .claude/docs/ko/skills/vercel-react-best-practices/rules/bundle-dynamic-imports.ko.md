# 무거운 컴포넌트는 dynamic import

- 초기 렌더에 필요 없는 대형 컴포넌트는 `next/dynamic`으로 지연 로드합니다.
- Monaco editor 같은 큰 의존성은 메인 청크에 섞이면 TTI와 LCP에 직접 영향을 줍니다.
- 첫 화면에 꼭 필요하지 않다면 on-demand로 분리합니다.

