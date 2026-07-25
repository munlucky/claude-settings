# Host 모델 설정

Date: 2026-07-25

Kernel 저장소에는 사용자별 실제 모델 ID나 인증 정보를 두지 않는다.
`kernel/model-policy.yaml`은 등급과 요구 역량만 선언하고, 실제 매핑은 Host 쪽에 있다.

## 우선순위

```text
Host invocation override
→ Host-specific environment
→ <kernel-runtime-home>/config/model-profiles.yaml
→ installed Host default
```

앞의 세 경로만 `enforced`가 될 수 있다. installed Host default가 쓰였다면
Kernel이 요구한 등급을 명시적으로 강제한 것이 아니므로 `advisory`로 기록한다.

## 환경 변수

```text
MOON_RELAY_KERNEL_<SURFACE>_FRONTIER
MOON_RELAY_KERNEL_<SURFACE>_VALUE
MOON_RELAY_KERNEL_MODEL_FRONTIER      # surface 공통 기본값
MOON_RELAY_KERNEL_MODEL_VALUE
MOON_RELAY_KERNEL_<SURFACE>_<CLASS>_EFFORT
```

## `model-profiles.yaml`

```yaml
schemaVersion: 1
hosts:
  codex:
    frontier_reasoning:
      model: ${MOON_RELAY_KERNEL_MODEL_FRONTIER}
      effort: high
    value_coding:
      model: ${MOON_RELAY_KERNEL_MODEL_VALUE}
      effort: medium
```

이 파일은 Project Knowledge에 저장하지 않는다. 런타임 홈에만 둔다.

## Host별 상태

| Host | 전략 | 비고 |
| --- | --- | --- |
| claude | subagent | role별 subagent, reviewer read-only, T3는 별도 세션 |
| codex | session override | 기본 `config.toml`에 model/model_provider를 고정하지 않음 |
| fable / 기타 | unsupported | 모델 전환이 검증되지 않은 표면은 지원한다고 가정하지 않음 |

Codex 기본 설정에 frontier 모델을 전역 고정하면 구현 worker까지 비싼 모델을
사용하게 되므로 금지한다. 모델 선택은 worker invocation 시점에만 일어난다.

## 정직한 실패

전환을 하지 못했는데 한 것처럼 기록하지 않는다.

```text
enforced    요청한 등급을 명시적으로 적용했고 실제 모델 identity를 확인함
fallback    적용했으나 실제 응답 모델이 요청과 다름
advisory    추천은 했으나 강제하지 못함 (Host default 포함)
unsupported 모델 선택 또는 identity 확인 기능이 없음
failed      dispatch 자체가 실패
```

토큰·비용을 Host가 제공하지 않으면 `null`로 남기고 measurement에서
`unavailable`로 보고한다. `0`으로 기록하지 않는다.
