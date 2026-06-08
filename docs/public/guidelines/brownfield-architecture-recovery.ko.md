# Brownfield Architecture Recovery Guideline

Brownfield architecture 작업은 새 구조를 제안하기 전에 현재 repository를 읽는 것에서 시작합니다.

source paths, tests, package scripts, runtime configuration, public docs, existing boundaries를 근거로 현재 architecture를 복구합니다.

module, adapter, data store, API, event, queue, external system, operational constraint에 대한 주장은 evidence를 함께 기록합니다.

Implementation planning 전에 owned paths, read-only paths, staged paths, shared mutable paths를 분리합니다.

Migration이 필요하면 `SPEC_DELTA.md` 또는 `PLAN.md`를 만들기 전에 compatibility contract와 risk register를 작성합니다.

선호하는 패턴으로 현재 architecture를 발명하지 않습니다. 근거 없는 주장은 assumption 또는 blocker로 남깁니다.
