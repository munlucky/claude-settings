---
name: teach-impeccable
description: 프로젝트의 디자인 컨텍스트를 수집해 `.impeccable.md`에 저장하고 이후 UI 작업에서 재사용하도록 만드는 스킬입니다.
surfaceStatus: optional_bundle_member
license: Apache 2.0. pbakaus/impeccable 기반으로 조정됨.
metadata:
  author: pbakaus
  source: https://github.com/pbakaus/impeccable
user-invocable: false
---

# Teach Impeccable

## 공개 범위

이 스킬은 지속 가능한 디자인 컨텍스트를 만드는 bootstrap helper입니다.
일상적인 UI 작업 진입점은 `frontend-design`으로 두는 편이 맞습니다.
디자인 컨텍스트가 없을 때만 선택 UI/design bundle 구성요소로 사용합니다.

UI 작업에 지속적인 디자인 컨텍스트가 필요할 때 프로젝트당 한 번 실행합니다.

## 목표

프로젝트 루트의 `.impeccable.md`에 `## Design Context` 섹션을 만들거나 갱신합니다.

## 절차

### 1. 먼저 코드베이스를 탐색

저장소에서 이미 드러나는 정보를 확인합니다.
- README와 문서
- 컴포넌트 라이브러리와 디자인 시스템 파일
- CSS 변수, 토큰, 테마, 폰트
- 스크린샷, 브랜드 자산, 문구 톤

이미 분명한 점과 아직 모르는 점을 구분합니다.

### 2. 부족한 질문만 묻기

AskUserQuestion 도구나 짧은 직접 질문으로 빈칸만 메웁니다.
- 사용자와 사용 맥락
- 해결하려는 작업
- 원하는 톤과 브랜드 성격
- 참고 레퍼런스와 피하고 싶은 예시
- 접근성 또는 모션 제약

### 3. 컨텍스트 기록

다음 형태로 저장합니다.

```md
## Design Context

### Users
...

### Brand Personality
...

### Aesthetic Direction
...

### Design Principles
...
```

### 4. 재사용 및 유지

- 방향이 바뀌면 같은 섹션을 갱신합니다.
- 서로 경쟁하는 컨텍스트 파일을 여러 개 만들지 않습니다.
- 저장소에 더 강한 단일 진실원이 이미 있으면 그것을 반영합니다.
