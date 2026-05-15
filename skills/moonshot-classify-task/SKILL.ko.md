---
name: moonshot-classify-task
description: 사용자 요청을 작업 유형(`feature`, `modification`, `bugfix`, `refactor`)으로 분류하고 의도 키워드를 추출한다. PM 분석 시작 시 사용.
surfaceStatus: internal_stage_owner
---

# PM 작업 분류

## 공개 범위

이 스킬은 내부 분석 마이크로스킬입니다.
직접 호출하기보다 `moonshot-orchestrator` 또는 `moonshot-phase-runner`를 우선합니다.

## 입력
- `analysisContext.request.userMessage`
- `context.md` (경로: `analysisContext.artifacts.contextDocPath`, 있으면 참조)

## 절차
1. 사용자 메시지에서 의도 키워드를 식별한다.
2. taskType을 하나 선택한다: `feature | modification | bugfix | refactor`.
3. 요청이 아직 제품 정의 단계인지 감지한다.
4. 신뢰도를 설정한다: `high | medium | low`.

## 휴리스틱
- feature: "신규", "추가", "구현", "만들기", "생성"
- modification: "변경", "수정", "개선", "조정", "제거"
- bugfix: "버그", "에러", "오류", "안 됨", "깨짐"
- refactor: "리팩터링", "정리", "재구성", "중복 제거"

## 제품 정의 요청 감지

요청의 주 목적이 아래에 해당하면 `signals.productDefinitionRequest: true`로 설정합니다.
- 아이디어 구체화
- product intent 정리
- PRD 작성
- solution 모델링
- 구현 전 아키텍처 정의
- 코딩 전 실행 계획 수립

예시 키워드:
- "idea", "intent", "prd", "solution", "spec", "scope", "out of scope", "plan", "task slice"

## 기술 스택 감지

React/Next.js 키워드 감지 시 시그널 설정:
- Keywords: "react", "next", "next.js", "nextjs", "jsx", "tsx", "useState", "useEffect"
- Output: `signals.reactProject: true`

## 출력 (patch)
```yaml
request.taskType: feature
request.keywords:
  - 구현
  - react
signals:
  productDefinitionRequest: false
  reactProject: true  # React/Next.js 키워드 감지 시 설정
notes:
  - "taskType=feature, confidence=high"
  - "product-definition-request=false"
  - "tech-stack: react/next.js detected"  # reactProject=true일 때 추가
```
