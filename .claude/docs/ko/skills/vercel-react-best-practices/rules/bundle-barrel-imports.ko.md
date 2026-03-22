# Barrel import 피하기

- `index.ts` 같은 barrel 파일에서 묶음 import를 하면 사용하지 않는 모듈까지 대량 로드될 수 있습니다.
- 아이콘/컴포넌트 라이브러리는 가능하면 직접 경로 import를 사용합니다.
- Next.js의 `optimizePackageImports`를 사용할 수 있다면 빌드 시 direct import로 변환하는 것도 방법입니다.

