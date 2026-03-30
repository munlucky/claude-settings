# Team Observability 가이드

팀 기반 하네스 실행에서 남겨야 할 최소 metric을 정의할 때 이 문서를 사용합니다.

## 목표

팀 토폴로지 선택을 정성 판단이 아니라 측정 가능한 판단으로 바꿉니다.

## 최소 Team Metrics

최소한 아래를 기록합니다.

- `selectedPattern`
- `selectedTeam`
- `selectionReason`
- `retryCount`
- `handoffCount`
- `indeterminateRatio`
- `verifierFailureCategories`
- `completionLeadTimeSeconds`

## 저장 위치

권장 artifact 경로:

- `.claude/team-metrics-<runId>.json`

## 규칙

- raw log를 그대로 복사하지 말고 run 요약 metric만 남깁니다.
- 선택된 pattern과 team은 함께 기록합니다.
- retry와 handoff는 active slice 또는 bounded run 단위로 집계합니다.
- 실패 카테고리는 run 간 비교가 가능하도록 정규화합니다.

## 권장 형태

```yaml
teamMetrics:
  selectedPattern: "fanout-fanin"
  selectedTeam: "review-team"
  selectionReason: "medium+ 구현 배치 뒤 병렬 리뷰"
  retryCount: 1
  handoffCount: 0
  indeterminateRatio: 0.0
  verifierFailureCategories: []
  completionLeadTimeSeconds: 420
```
