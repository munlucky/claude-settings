# 라우팅 평가 프로토콜

Date: 2026-07-25
Corpus: `tests/fixtures/kernel-model-routing/corpus.json` (`kernel-model-routing.v1`)
Runner: `scripts/kernel/eval/model-routing-eval.mjs`

## 비교군

```text
Baseline A: 모든 provider 턴을 frontier_reasoning으로 고정
Candidate B: 실제 라우팅 정책 적용 (승격 규칙 포함)
```

두 arm은 동일한 턴 시퀀스를 사용한다. 차이는 각 턴이 어느 등급에 배정되는가뿐이다.

## 측정하는 것

| 지표 | 결과 | 목표 |
| --- | --- | --- |
| frontier turn ratio | 0.391 | ≤ 0.40 |
| token-cost proxy ratio | 0.534 | ≤ 0.70 |
| T3 independent review coverage | 100% | 100% |
| routing receipt coverage | 100% | 100% |
| unsupported를 enforced로 기록한 사례 | 0 | 0 |

토큰 값은 **고정 합성 워크로드**이며 실제 provider 사용량이 아니다. 가격은
코드에 하드코딩하지 않고 `costWeights`로만 표현한다.

frontier turn ratio는 케이스당 build 턴 수에 민감하다. corpus는 계획·리뷰가
소수 턴이고 구현 루프가 여러 턴인 실제 run 형태를 모델링한다. 등급별 토큰 가중
proxy가 더 안정적인 지표다.

## 측정하지 않는 것

품질, 완료율, 실제 비용은 라이브 모델 실행이 필요하다. 이 하네스는 정책 동작만
측정하므로 해당 항목은 추정하지 않고 `unavailable`로 보고한다.

```json
{ "qualityDelta": { "status": "unavailable", "reason": "live-model-execution-not-run" },
  "completionRateDelta": { "status": "unavailable", "reason": "live-model-execution-not-run" } }
```

추정값을 넣으면 완료 게이트가 막으려는 바로 그 근거 없는 확신이 된다.
Promotion Gate의 품질 조항은 라이브 모델 실행이 붙기 전까지 미충족으로 남는다.

## 별도로 유지되는 것

false completion 회귀는 기존 sentinel corpus(`tests/kernel-sentinel/corpus.json`)가
계속 담당한다. 라우팅은 완료 권위를 바꾸지 않으므로 sentinel 결과가 회귀 기준이다.
