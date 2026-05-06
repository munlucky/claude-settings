# AWTL / RSME 분류, 개인정보, 출처 계약

Last-Reviewed: 2026-05-06

이 계약은 phase-01에서 sink, runner, MemoryGraph 승격 작업이 시작되기 전에 경계 언어를 고정한다.

## 용어

| 용어 | 정의 |
|---|---|
| `AWTL` | 활성 workflow layer에서 수집되는 raw observation 스트림이다. 일시적인 실행 세부 정보를 포함할 수 있으므로 redaction 전에는 민감한 데이터로 취급한다. |
| `RSME` | repository 범위의 compact fact envelope이다. phase 01에서는 확장 의미를 의도적으로 열어 두고, 하드한 정의를 만들지 않고 ADR 스타일 결정으로 남긴다. |
| `event` | 실행 또는 검증 중 관찰된 개별 발생이다. event는 추적 가능하지만 자동 승격 대상은 아니다. |
| `span` | 관련 event를 묶는 bounded interval이며, 승격 자격을 의미하지 않는다. |
| `action` | observation 데이터를 만들 수 있는 의도 기반 단계이다. |
| `memory candidate` | provenance 검증 후 승격될 수 있는 compact fact 또는 패턴이다. |
| `promotion` | compact fact를 재사용 가능한 MemoryGraph 지식으로 옮기는 승인 기반 단계이다. raw AWTL는 이 gate를 우회할 수 없다. |

## Failure Taxonomy V1

phase 01은 12개의 leaf를 가진 bounded taxonomy를 기록한다. leaf 수는 source plan의 15개 충돌 상한보다 작게 유지한다.

- `capture_missing`
- `capture_partial`
- `trace_not_ignored`
- `trace_path_leaked`
- `redaction_uncertain`
- `redaction_drop`
- `redaction_hash`
- `provenance_missing`
- `provenance_invalid`
- `promotion_denied`
- `memory_lookup_raw`
- `taxonomy_mismatch`

## 개인정보 정책

- 값이 secret-like 하거나, 불확실하거나, 안전하다고 자신 있게 분류할 수 없으면 fail closed 한다.
- token, password, cookie, bearer string, API key는 사람에게 보이는 요약에 그대로 남기지 않는다.
- 가장 안전한 결과가 값 생략이면 `drop`을 우선한다.
- 반복 탐지나 provenance 상관관계가 필요할 때만 `hash`를 사용한다.
- `uncertain`은 helper가 값을 안전하다고 증명하지 못했다는 뜻이므로 downstream caller는 safe 값으로 취급하면 안 된다.

### 저장 금지 항목

- raw trace payload
- secret-like string
- authorization header
- session cookie
- password 및 recovery code
- unredacted bearer token

### 저장 허용 항목

- compact fact
- count
- timestamp
- provenance tag
- 필요한 경우의 sensitive value hash

## Provenance 경계

MemoryGraph 승격은 provenance와 validation tag가 붙은 compact fact에만 허용된다.

### 필수 promotion tag

- `source:moonshot`
- `project:claude-settings`
- `origin:awtl`
- `validated_by:redaction-helper`
- `validated_by:provenance-boundary`

### Phase 05 replay gate

- 후보는 replay 증거 또는 human approval이 있을 때만 승격합니다.
- transcript-only 또는 imported-only 후보는 거부합니다.
- environment, flaky, harness blocker는 그대로 유지합니다.

### Non-goals

- `project-memory-agent`는 raw AWTL trace file을 직접 조회하지 않는다.
- raw trace data를 재사용 가능한 지식으로 MemoryGraph에 쓰지 않는다.
- 승인 증거 없이 promotion하지 않는다.

## Trace 정책

- `.claude/traces/`는 ignore 대상 경로다.
- 경로는 일시적인 runtime output용으로만 존재할 수 있고 version control에는 들어가지 않는다.
- ignore 경계를 벗어난 trace artifact는 정책 결함이다.
- `agent_work_trace.jsonl`은 AWTL event의 canonical append-only source of truth다.
- `judge_result.jsonl`은 canonical log에서 만든 materialized view이며 독립적인 source가 아니다.
- 부분 쓰기나 손상된 JSONL line은 canonical file을 다시 쓰기 전에 quarantine해야 한다.

## 열린 결정 기록

| 항목 | 상태 | 결정 |
|---|---|---|
| RSME 약어 확장 | open | maintainer 승인 또는 다음 ADR까지 확장을 미룬다. |
