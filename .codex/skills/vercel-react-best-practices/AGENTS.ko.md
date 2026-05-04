# React Best Practices

**Version 1.0.0**
Vercel Engineering
January 2026

> **참고:**
> 이 문서는 Vercel에서 React/Next.js 코드를 유지보수, 생성, 리팩터링할 때
> 에이전트와 LLM이 따르도록 만든 가이드입니다.
> 사람도 읽을 수 있지만, 설명 방식은 자동화와 일관성을 우선합니다.

---

## 개요

React/Next.js 애플리케이션 성능 최적화를 위한 종합 가이드입니다.
40개 이상의 규칙을 8개 카테고리로 나누고, 영향도가 큰 항목부터 우선 적용할 수 있게 구성합니다.

## 카테고리

1. 워터폴 제거 — **CRITICAL**
2. 번들 크기 최적화 — **CRITICAL**
3. 서버 성능 — **HIGH**
4. 클라이언트 데이터 페칭 — **MEDIUM-HIGH**
5. 리렌더 최적화 — **MEDIUM**
6. 렌더링 성능 — **MEDIUM**
7. JavaScript 성능 — **LOW-MEDIUM**
8. 고급 패턴 — **LOW**

## 사용 방법

- 상세 규칙 원문: `.claude/skills/vercel-react-best-practices/rules/*.md`
- 한국어 미러 요약: `.claude/docs/ko/skills/vercel-react-best-practices/rules/*.ko.md`
- 리뷰나 리팩터링에서는:
  1. 카테고리 우선순위를 먼저 본다.
  2. 관련 규칙의 한국어 요약을 확인한다.
  3. 코드 예제가 필요하면 영어 원문 규칙 파일을 읽는다.

## 핵심 적용 순서

1. 독립 비동기 작업의 워터폴 제거
2. 초기 렌더에 불필요한 번들 축소
3. 서버/클라이언트 경계 직렬화 최소화
4. 불필요한 리렌더와 effect 재실행 억제
5. DOM/CSS/SVG/이벤트 리스너의 핫패스 최적화

## 참고

- 이 한글 문서는 색인/요약 역할입니다.
- 전체 예제와 상세 근거는 영어 원문 `AGENTS.md`와 각 규칙 원문을 기준으로 유지합니다.
