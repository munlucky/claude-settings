# 테스팅 가이드라인

테스트를 작성하거나 실행하기 전에 먼저 테스트 환경을 확인합니다.

- 변경을 `docs_only`, `local_policy`, `behavior_change` 로 분류합니다.
- 가장 작은 관련 테스트 범위부터 실행하고 필요하면 확장합니다.
- `behavior_change` 는 가능하면 실패하는 테스트나 결정적 증거에서 시작하고, 버그 수정은 회귀 커버리지나 동등한 verifier evidence 가 필요합니다.
- 명시적 사유 없이 기존 테스트를 삭제하지 않습니다.
- `docs_only` 와 대부분의 `local_policy` 는 audit 와 syntax/evidence check 로 마무리할 수 있습니다.
- `behavior_change` 는 실행 가능한 검증이 없으면 그 사실을 보고하고 보수적으로 판단합니다.
- 이 저장소에서는 knowledge audit 와 변경된 셸 스크립트의 `bash -n` 을 우선합니다.
- 테스트나 verifier coverage 가 부족하면 `implementation-runner` 와 `completion-verifier` 는 보수적으로 동작합니다.
