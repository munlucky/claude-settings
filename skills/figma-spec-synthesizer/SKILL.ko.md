---
name: figma-spec-synthesizer
description: Figma 라이브 파일, Figma URL, node ID, screenshot, 큰 Figma 기획 보드를 바탕으로 구현 가능한 UI 디자인 스펙과 기획/정책 스펙을 합성합니다. 사용자가 Figma 디자인 스펙, 기획 스펙, 제품 정책 스펙, 상호작용 상태, 화면 동작을 정리하거나 추가된 Figma 케이스로 기존 스펙을 업데이트해 달라고 할 때 사용합니다.
---

# Figma Spec Synthesizer

## 역할

Figma 라이브 디자인/기획 node를 개발자가 Figma를 다시 열지 않고도 일반 구현을 진행할 수 있는 독립 스펙으로 변환합니다.

이 스킬은 Figma-first 합성 전용입니다. 정적 파일 파싱은 `design-asset-parser`에 둡니다.

## 경계

이 스킬을 사용하는 경우:
- Figma 디자인 URL 또는 node ID
- Figma 기획/스펙 board
- Figma frame의 screenshot 기반 판독
- 새 Figma 케이스를 기존 UI/기획 스펙에 추가
- 디자인 사실과 기획/정책 사실 분리

이 스킬을 사용하지 않는 경우:
- live Figma 맥락이 없는 일반 PDF/CSS/HTML export 파싱; `design-asset-parser` 사용
- 시각 polish 또는 frontend 구현; `frontend-design` 사용
- 아이디어에서 PRD/계획까지 이어지는 전체 workflow; `product-orchestrator` 사용

Figma MCP 도구가 `figma-use` 같은 plugin skill을 요구하면 해당 도구별 스킬을 먼저 로드합니다.

## 입력 처리

Figma URL마다:
1. `/design/<fileKey>/...`에서 `fileKey`를 추출합니다.
2. `node-id=123-456`을 추출합니다.
3. node ID를 Figma API 형식 `123:456`으로 변환합니다.
4. 원본 URL과 변환된 node ID를 최종 스펙의 evidence에 보존합니다.

작성 전 확인합니다:
- 사용자 요청과 대상 범위
- 업데이트해야 할 기존 스펙 파일
- 주변 repo 문서 관례
- 디자인이 field/API shape에 의존할 때 현재 code/data model

## Evidence Workflow

생성 코드, metadata, 텍스트 레이어만 신뢰하지 않습니다. 이미지 분석은 필수입니다.

1. node 확인
   - 가능하면 metadata로 node 이름과 범위를 확인합니다.
   - UI 계층/스타일 힌트가 필요하면 design context를 사용합니다.
   - 기획 board에서는 텍스트 레이어 추출이 읽기 순서 보조가 될 수 있지만 보조 수단일 뿐입니다.

2. 시각 evidence 확보
   - 대상 node를 `get_screenshot`으로 캡처합니다.
   - 넓은 기획 board에는 높은 `maxDimension`을 사용합니다.
   - label, 주변 board 맥락, annotation이 중요하면 `contentsOnly=false`를 사용합니다.
   - Figma MCP가 view-seat/quota 한도에 걸리면 로그인된 browser session과 viewport screenshot을 사용합니다.
   - screenshot URL 다운로드가 sandbox/network 제한으로 막히면 승인된 network access로 재실행하거나 browser screenshot으로 대체합니다.

3. 큰 board 분할
   - 넓거나 밀도 높은 screenshot은 의미 단위 또는 좌표 단위 crop으로 나눕니다.
   - board가 다른 흐름을 명시하지 않으면 좌->우, 상->하 순서로 읽습니다.
   - 작은 글자, 정책 표, alert 문구, annotation은 확대 crop을 추가합니다.
   - 스펙에서 Figma node와 board section을 인용할 수 있을 정도로 source detail을 추적합니다.

4. source 조정
   - 보이는 UI/copy를 primary evidence로 둡니다.
   - 텍스트 레이어는 전사 오류를 줄이는 용도로 쓰고 이미지 확인을 대체하지 않습니다.
   - code/data model 확인은 구현 가정이나 gap 표시 용도로만 사용합니다.

## 합성 규칙

관심사별로 산출물을 분리합니다:
- UI 디자인 스펙: screen map, layout, component, variant, copy, interaction state, responsive assumption, UI data dependency, QA checklist.
- 기획/정책 스펙: goal, entry path, business rule, validation policy, state/exposure rule, cache/refresh rule, API/data requirement, open decision.

두 관심사가 모두 있으면 별도 문서로 작성하고 서로 cross-link합니다.

사용자가 케이스 추가나 기존 산출물 업데이트를 요청하면 기존 스펙 갱신을 우선합니다. 고립된 메모를 붙이지 말고 관련 state matrix, copy table, policy section, QA checklist를 수정합니다.

각 진술은 다음 중 하나로 구분합니다:
- Figma에서 확인됨
- 주변 디자인에서 추론됨
- repo/code 기반 구현 가정
- open question

## 필수 커버리지

보이는 모든 상태와 variant를 다룹니다:
- empty, loading, error, success, disabled
- 선택/미선택 tab
- 본인 콘텐츠와 타인 콘텐츠
- 별점 있음/없음 또는 partial-rating 상태
- 콘텐츠 있음/없음
- 첫 항목/첫 기여 상태
- list, detail, popup/modal, 외부 진입 경로

다음 문구는 보이는 그대로 옮깁니다:
- label
- CTA button
- empty state
- alert
- toast
- validation message
- tab name

숫자와 단위가 중요한 규칙은 재검증합니다. 자주 틀리는 항목:
- 글자 수와 줄 수
- 최소와 최대
- 화면에서 잘린 문구와 원본 문구
- 추천지수 존재와 추천사 본문 존재

## UI 스펙 템플릿

```markdown
# <Feature> UI Spec

## Source Evidence
| Source | Node | Board/Frame section | Notes |
|--------|------|---------------------|-------|

## Implementation Scope
- Included:
- Excluded:
- Assumptions:

## Screen Map
| Surface | Entry path | Purpose |
|---------|------------|---------|

## UI Structure
### <Screen or Component>
- Layout:
- Main elements:
- Data dependencies:

## State Matrix
| State | Trigger/Data | UI result | Actions | Notes |
|-------|--------------|-----------|---------|-------|

## Copy and Messages
| Context | Exact copy | Condition |
|---------|------------|-----------|

## Interaction Rules
| Action | Enabled when | Result | Error/empty/loading |
|--------|--------------|--------|---------------------|

## Implementation Notes
- Components:
- API/data assumptions:
- QA checklist:

## Open Questions
```

## 기획 스펙 템플릿

```markdown
# <Feature> Planning Spec

## Source Evidence
| Source | Node | Board section | Notes |
|--------|------|---------------|-------|

## Goal and User Flow
- Goal:
- Primary users:
- Entry paths:

## Policy Summary
| Area | Rule | Impact |
|------|------|--------|

## State and Exposure Rules
| Scenario | Condition | User-visible behavior | Data/API implication |
|----------|-----------|-----------------------|----------------------|

## Validation and Messaging
| Input/Action | Rule | Message/Toast | Notes |
|--------------|------|---------------|-------|

## Data/API Requirements
| Requirement | Needed fields | Producer/consumer | Open issue |
|-------------|---------------|-------------------|------------|

## Cross-Spec Links
- Related UI spec:
- Related implementation files:

## Development Checklist

## Open Questions
```

## 최종 확인

최종 응답 전:
1. 작성/수정한 스펙 파일을 다시 읽습니다.
2. 제공된 모든 Figma node를 이미지로 확인했는지 검증합니다.
3. 추가 케이스가 기존 섹션에 통합됐는지 확인합니다.
4. screenshot 기준으로 정확한 한국어 문구와 숫자 제한을 재확인합니다.
5. 문서만 바꾼 경우 test/build를 생략한 이유를 명시합니다.
