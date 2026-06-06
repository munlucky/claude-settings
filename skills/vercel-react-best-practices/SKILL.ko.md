---
name: vercel-react-best-practices
description: Vercel Engineering의 React/Next.js 성능 최적화 가이드. React/Next.js 코드를 작성, 리뷰, 리팩터링할 때 성능 패턴을 맞추기 위해 사용합니다.
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# Vercel React Best Practices

Vercel이 유지하는 React/Next.js 성능 최적화 가이드입니다. 8개 카테고리, 45개 내외의 규칙을 영향도 기준으로 정리해 자동 리팩터링과 코드 생성에 활용할 수 있게 구성합니다.

## 적용 시점

- 새 React 컴포넌트나 Next.js 페이지 작성
- 클라이언트/서버 데이터 페칭 구현
- 성능 이슈 코드 리뷰
- 기존 React/Next.js 코드 리팩터링
- 번들 크기와 로드 시간 최적화

## 우선순위 카테고리

| 우선순위 | 카테고리 | 영향도 | 접두사 |
|----------|----------|--------|--------|
| 1 | 워터폴 제거 | CRITICAL | `async-` |
| 2 | 번들 크기 최적화 | CRITICAL | `bundle-` |
| 3 | 서버 성능 | HIGH | `server-` |
| 4 | 클라이언트 데이터 페칭 | MEDIUM-HIGH | `client-` |
| 5 | 리렌더 최적화 | MEDIUM | `rerender-` |
| 6 | 렌더링 성능 | MEDIUM | `rendering-` |
| 7 | JavaScript 성능 | LOW-MEDIUM | `js-` |
| 8 | 고급 패턴 | LOW | `advanced-` |

## 사용 방법

- 상세 규칙은 영어 원본 `rules/*.md`를 기준으로 유지합니다.
- 한국어 미러는 별도 디렉터리의 축약형 요약본을 사용합니다:
  - `.moonshot-relay/docs/ko/skills/vercel-react-best-practices/rules/`
- 리뷰나 리팩터링 시에는 카테고리 우선순위를 먼저 적용하고, 필요한 경우 원문 예제까지 내려가 확인합니다.

## 빠른 기준

- 독립 비동기 작업은 병렬화합니다.
- 초기 렌더에 불필요한 무거운 번들은 늦게 로드합니다.
- 서버/클라이언트 경계의 직렬화 데이터는 최소화합니다.
- 리렌더를 유발하는 불필요한 의존성, 상태 구독, 콜백 재생성을 줄입니다.
- DOM/CSS, 리스트, SVG, 이벤트 리스너는 비용이 큰 지점을 먼저 최적화합니다.
