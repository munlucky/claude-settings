# SVG 자체 대신 wrapper를 애니메이션

- SVG 요소 자체보다 바깥 `div` wrapper에 transform 애니메이션을 주는 편이 하드웨어 가속과 브라우저 최적화에 유리합니다.
- 복잡한 SVG는 직접 애니메이션 시 비용이 커질 수 있습니다.
- 이동, 스케일, 회전처럼 wrapper로 충분한 경우 wrapper를 우선합니다.

