# Harness Engineering Docset Improvement Plan

Last-Reviewed: 2026-03-30

## 목적

이 문서는 `docs/claude-tasks/harness-engineering-foundation` 디렉토리 문서군을 모두 검토한 뒤, 문서 역할 분리, 중복 축소, 실행 가능성 강화 관점에서 개선 계획을 제시한다.

범위는 문서 자체의 구조 개선이다.
하네스 기능 구현 자체보다 먼저, 이 주제 문서들이 어떤 책임을 가져야 하는지 정리하는 데 초점을 둔다.

## 검토 대상

- `harness-engineering-foundation.md`
- `gap-analysis.md`
- `harness-application-ideas.md`

## 현재 문서군 진단

### 총평

현재 문서군은 내용의 질은 높다.
다만 읽는 순서, 문서별 책임 경계, 실행 추적 방식이 아직 덜 정리돼 있다.

지금 상태는 다음 특징을 가진다.

- `foundation` 문서는 기준 모델과 철학을 잘 설명한다.
- `gap-analysis` 문서는 현재 저장소 평가와 로드맵을 제시한다.
- `application-ideas` 문서는 외부 Harness 리포트를 현재 저장소에 번역한 실행 아이디어를 모은다.

문제는 세 문서가 모두 부분적으로 `우선순위`, `로드맵`, `다음 단계`를 말하고 있어, 읽는 사람이 "무엇이 기준 문서이고 무엇이 실행 백로그인지"를 바로 구분하기 어렵다는 점이다.

## 문서별 진단

### `harness-engineering-foundation.md`

현재 강점:

- 하네스 엔지니어링의 정의, 레이어, 기둥, 운영 루프, 성숙도 모델이 잘 정리돼 있다.
- 외부 참고 자료가 풍부해 기준 문서 역할을 수행할 수 있다.

개선 필요:

- 기준 문서와 현재 저장소 적용 시사점이 한 문서 안에 섞여 있다.
- 실행 항목보다 개념 설명이 많아 길이가 길고, 참조 문서로는 좋지만 빠른 진입에는 무겁다.
- `현재 claude-settings에 주는 시사점`은 본래 `gap-analysis` 또는 `application-ideas`의 역할에 더 가깝다.

권장 역할:

- 변하지 않는 기준 모델
- 용어 정의
- 레이어/기둥/운영 루프/성숙도 모델
- 외부 참고 근거

### `gap-analysis.md`

현재 강점:

- 현재 저장소의 강점과 한계를 구조적으로 평가한다.
- P1/P2/P3 우선순위와 기간별 로드맵이 있다.

개선 필요:

- `application-ideas`와 우선순위 항목이 상당히 겹친다.
- "갭 진단"과 "구체 실행 설계"가 아직 분리되지 않았다.
- 어떤 항목이 이미 다른 문서에서 더 구체화되었는지 상태가 드러나지 않는다.

권장 역할:

- 현재 상태 평가
- 근거 기반 갭 목록
- severity/priority 판단
- 실행 상세는 다른 문서로 링크

### `harness-application-ideas.md`

현재 강점:

- 외부 Harness 리포트를 현재 저장소에 번역한 내용이 실용적이다.
- 제안 항목별로 이유, 적용 방식, 기대 효과가 잘 정리돼 있다.

개선 필요:

- 일부 항목이 `gap-analysis`의 P1/P2/P3와 사실상 같은 메시지를 다시 말한다.
- "아이디어 모음"인지 "승인된 개선안"인지 상태가 표시되지 않는다.
- 실제 구현 대상 파일과 단계는 제시되지만, 추적 가능한 workstream 구조는 아직 없다.

권장 역할:

- 후보 개선안 카탈로그
- 옵션 비교
- 설계 방향성
- 상태는 `proposed/accepted/deferred`로 명시

## 핵심 문제

### 1. 문서 역할 경계가 완전히 고정돼 있지 않다

기준 문서, 평가 문서, 실행 아이디어 문서가 분리돼 있으나, 각 문서에 `로드맵`과 `다음 단계`가 동시에 존재한다.

### 2. 읽는 순서가 명시돼 있지 않다

처음 읽는 사람은 세 문서를 어떤 순서로 봐야 하는지 바로 알 수 없다.

### 3. 실행 상태가 추적되지 않는다

아이디어가 `제안`, `합의`, `착수`, `완료`, `보류` 중 어디에 있는지 문서군만 봐서는 알기 어렵다.

### 4. 구현 추적 문서가 없다

현재는 진단과 제안은 있지만, "어떤 파일을 언제 어떤 순서로 바꿀지"를 추적하는 실행 중심 backlog 문서가 없다.

### 5. 중복이 누적될 위험이 있다

이 상태에서 새 문서를 계속 추가하면 같은 논점이 여러 문서에 퍼질 가능성이 높다.

## 목표 상태

이 디렉토리는 아래 네 종류 문서로 역할이 명확해야 한다.

1. 기준 문서
   - 개념, 원칙, 모델, 용어
2. 평가 문서
   - 현재 저장소 상태와 갭
3. 제안 문서
   - 적용 아이디어와 설계 방향
4. 실행 문서
   - 실제 개선 workstream, 상태, 완료 조건

## 개선 계획

### 1. 디렉토리 인덱스 문서 추가

#### 작업

- 이 디렉토리에 `README.md` 또는 동등한 인덱스 문서를 추가한다.

#### 포함 내용

- 문서별 목적
- 권장 읽기 순서
- 현재 canonical 문서
- active improvement plan 링크

#### 기대 효과

- 신규 독자가 1분 안에 문서 구조를 이해할 수 있다.

### 2. 문서 책임 경계 고정

#### 작업

- `harness-engineering-foundation.md`는 기준 모델만 남기고, 현재 저장소 특화 시사점은 축약하거나 다른 문서로 넘긴다.
- `gap-analysis.md`는 현재 상태 진단과 우선순위 판단만 남긴다.
- `harness-application-ideas.md`는 후보 개선안을 다루되, 상태 필드를 추가한다.

#### 기대 효과

- 같은 메시지가 세 문서에서 반복되는 문제를 줄인다.

### 3. 상태 관리 규약 도입

#### 작업

- 제안 항목마다 최소 상태를 둔다.
  - `proposed`
  - `accepted`
  - `in_progress`
  - `done`
  - `deferred`
- 상태 변경 기준을 이 디렉토리 문서에 명시한다.

#### 기대 효과

- 아이디어 문서가 곧바로 실행 백로그처럼 쓰일 수 있다.

### 4. 실행 backlog 문서 신설

#### 작업

- 이 디렉토리에 `implementation-backlog.md` 또는 동등한 문서를 추가한다.
- 각 항목은 다음 필드를 가진다.
  - title
  - rationale
  - target files
  - dependencies
  - acceptance criteria
  - status

#### 기대 효과

- 진단 문서와 실제 구현 변경 사이에 다리가 생긴다.

### 5. 링크 구조 정리

#### 작업

- 각 문서 하단 `관련 문서` 섹션을 통일한다.
- `foundation -> gap-analysis -> application-ideas -> implementation-backlog` 순으로 상호 링크를 건다.

#### 기대 효과

- 문서 추가 이후에도 탐색 비용이 낮아진다.

### 6. 중복 제거 원칙 명시

#### 작업

- 같은 주장은 한 문서에서만 canonical하게 서술한다.
- 다른 문서에서는 한두 줄 요약 후 링크만 둔다.

예시:

- `전략 게이트 필요성`의 canonical 설명은 `gap-analysis` 또는 `application-ideas` 중 하나에만 둔다.
- `foundation`에서는 원칙 수준 설명만 남긴다.

#### 기대 효과

- 문서 일관성과 유지보수성이 올라간다.

## 권장 문서 역할 재정의

### `harness-engineering-foundation.md`

역할:

- canonical foundation

남겨야 할 것:

- 정의
- 3대 레이어
- 5대 기둥
- 운영 루프
- 역할 모델
- 성숙도 모델
- 참고 자료

줄이거나 이동할 것:

- 현재 저장소 특화 시사점
- 바로 실행 가능한 로컬 개선 항목

### `gap-analysis.md`

역할:

- canonical assessment

남겨야 할 것:

- 현재 강점
- 현재 한계
- 갭 진단
- 우선순위 평가

줄이거나 이동할 것:

- 상세 설계 제안
- 구체 구현 방식

### `harness-application-ideas.md`

역할:

- canonical proposal catalog

남겨야 할 것:

- 적용 아이디어
- 기대 효과
- 도입 순서
- 예상 파일 영향 범위

추가할 것:

- 각 아이디어 상태
- 근거 문서 링크
- backlog 항목 ID

## 우선순위

### P1

- 인덱스 문서 추가
- 문서 책임 경계 고정
- 상태 규약 도입

### P2

- 실행 backlog 문서 추가
- 상호 링크 구조 통일
- canonical 서술 위치 정리

### P3

- 문서 템플릿화
- 향후 workstream 분할 규약 추가

## 추천 실행 순서

### 1단계

- `README.md` 추가
- 각 문서 상단에 `역할` 한 줄 추가
- `application-ideas`에 상태 필드 설계

### 2단계

- `implementation-backlog.md` 추가
- `gap-analysis`와 `application-ideas`에서 중복 문단 축약
- canonical 링크 구조 반영

### 3단계

- 문서 템플릿 정리
- 이후 신규 하네스 문서는 같은 구조를 따르도록 규약화

## 완료 기준

다음 조건을 만족하면 이 디렉토리 문서군 개선 1차 완료로 본다.

- 신규 독자가 읽기 순서를 바로 알 수 있다.
- 각 문서의 canonical 역할이 한 줄로 설명된다.
- 같은 개선 항목이 여러 문서에서 중복 서술되지 않는다.
- 제안 항목의 상태가 표시된다.
- 구현 작업으로 연결되는 backlog 문서가 존재한다.

## 즉시 다음 작업 제안

문서군 개선 자체의 첫 실행 배치로는 아래 순서를 권장한다.

1. `README.md` 추가
2. `implementation-backlog.md` 추가
3. `harness-application-ideas.md`에 상태 필드 추가
4. `harness-engineering-foundation.md`에서 저장소 특화 시사점 축약
5. `gap-analysis.md`에서 상세 실행 항목은 backlog로 링크

## 결론

현재 문서군은 내용 부족 문제가 아니라 구조 선명도 문제가 더 크다.

따라서 다음 단계는 새 아이디어를 더 쓰는 것보다, 아래를 먼저 고정하는 것이다.

- 어떤 문서가 기준인지
- 어떤 문서가 평가인지
- 어떤 문서가 제안인지
- 어떤 문서가 실제 실행 상태를 추적하는지

이 경계만 고정되면 이후 하네스 개선 작업은 훨씬 덜 흔들리게 된다.

## 관련 문서

- `docs/claude-tasks/harness-engineering-foundation/harness-engineering-foundation.md`
- `docs/claude-tasks/harness-engineering-foundation/gap-analysis.md`
- `docs/claude-tasks/harness-engineering-foundation/harness-application-ideas.md`
