# Harness Engineering Foundation Docset

Last-Reviewed: 2026-03-30

## 목적

이 디렉토리는 `claude-settings` 저장소의 하네스 엔지니어링 기준, 현재 갭, 적용 아이디어, 실행 backlog를 한곳에서 관리하기 위한 문서군이다.

## 읽기 순서

1. `harness-engineering-foundation.md`
   - 하네스 엔지니어링의 기준 모델, 레이어, 기둥, 운영 루프를 이해할 때 읽는다.
2. `gap-analysis.md`
   - 현재 저장소가 그 기준 대비 어디까지 왔는지 평가할 때 읽는다.
3. `harness-application-ideas.md`
   - 외부 Harness 리포트를 현재 저장소에 어떻게 번역할지 볼 때 읽는다.
4. `implementation-backlog.md`
   - 실제 개선 workstream, 상태, 대상 파일, 완료 조건을 추적할 때 읽는다.
5. `docset-improvement-plan.md`
   - 이 문서군 자체를 어떻게 정리하고 유지할지 볼 때 읽는다.
6. `anthropic-article-application-plan.md`
   - Anthropic의 2026-03-24 long-running harness 글을 현재 저장소 기준으로 다시 적용할 때, 이미 반영된 항목을 제외하고 남은 적용 계획만 볼 때 읽는다.

## 문서 역할

| 문서 | 역할 | Canonical 여부 |
|---|---|---|
| `harness-engineering-foundation.md` | 기준 모델과 용어 정의 | canonical foundation |
| `gap-analysis.md` | 현재 저장소 평가와 갭 진단 | canonical assessment |
| `harness-application-ideas.md` | 적용 아이디어 카탈로그 | canonical proposal catalog |
| `implementation-backlog.md` | 실제 실행 항목과 상태 추적 | canonical execution backlog |
| `docset-improvement-plan.md` | 문서군 구조 개선 계획 | canonical docset maintenance plan |
| `anthropic-article-application-plan.md` | Anthropic 글 기준의 현재 시점 적용 계획 | targeted application plan |

## 상태 규약

제안 또는 실행 항목은 아래 상태 중 하나를 사용한다.

- `proposed`
- `accepted`
- `in_progress`
- `done`
- `deferred`

해석 기준:

- `proposed`: 제안은 되었지만 아직 실행 commit을 시작하지 않음
- `accepted`: 방향은 채택됐지만 아직 구현 전
- `in_progress`: 구현 또는 문서 반영 중
- `done`: 1차 완료 기준을 충족함
- `deferred`: 의도적으로 뒤로 미룸

## 유지 원칙

1. 같은 주장의 canonical 설명은 한 문서에만 둔다.
2. 다른 문서에서는 짧게 요약하고 링크한다.
3. 실행 항목은 `implementation-backlog.md`에 ID와 상태를 둔다.
4. 새 문서를 추가할 때는 이 인덱스에도 역할을 등록한다.

## 관련 문서

- `docs/claude-tasks/harness-engineering-foundation/harness-engineering-foundation.md`
- `docs/claude-tasks/harness-engineering-foundation/gap-analysis.md`
- `docs/claude-tasks/harness-engineering-foundation/harness-application-ideas.md`
- `docs/claude-tasks/harness-engineering-foundation/implementation-backlog.md`
- `docs/claude-tasks/harness-engineering-foundation/docset-improvement-plan.md`
- `docs/claude-tasks/harness-engineering-foundation/anthropic-article-application-plan.md`
