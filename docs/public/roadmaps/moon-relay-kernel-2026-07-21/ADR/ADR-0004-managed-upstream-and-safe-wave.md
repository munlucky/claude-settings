# ADR-0004 Managed Upstream Skills and Safe Wave Execution

## Status

Accepted

## Context

Kernel은 Ponytail, Matt Pocock Skills, GSD, Spec Kit, BMAD, Superpowers 등에서 검증된 메커니즘을 활용하고자 한다. 원문을 고정 복사하면 upstream 개선을 놓치고, 자동 동기화하면 재현성과 공급망 안전을 잃는다. 또한 task DAG를 만들더라도 모든 독립 티켓을 즉시 병렬화하면 수직 슬라이스의 실제 write-set과 shared surface 충돌을 놓칠 수 있다.

## Decision

### 외부 스킬

- 핵심 스킬은 `derived`, 선택형 스킬은 `wrapped`, 개인 실험은 `subscribed` 모드를 사용한다.
- registry는 repository, pinned commit, license, adopted patterns, eval suite를 기록한다.
- upstream update는 check → diff → classify → A/B eval → security/license review → proposal → human approval → pin update 순서로 처리한다.
- 자동 변경 탐지와 proposal 생성은 허용하지만 자동 적용은 금지한다.

### 병렬 실행

- 기본 실행 모드는 sequential이다.
- v1은 DAG와 Wave dry-run만 제공한다.
- 같은 Wave는 dependency, predicted write-set, schema/migration, public interface, fixture, design premise 충돌이 없어야 한다.
- 실제 병렬 실행은 maxWorkers=2, no nested fanout, deterministic merge order, Wave integration verification을 요구한다.
- 안전 조건을 충족하지 못하면 순차 실행으로 fallback한다.

## Consequences

- upstream 개선을 추적하면서도 동일 pin에서 결과를 재현할 수 있다.
- supply-chain 위험과 모델별 회귀를 통제한다.
- 병렬화 가능한 작업의 wall-clock time을 줄일 수 있다.
- registry 유지와 write-set 예측 평가 비용이 발생한다.

## Rejected Alternatives

- 외부 SKILL.md를 무검증 자동 업데이트한다.
- 외부 프로젝트 전체를 Kernel runtime dependency로 둔다.
- task graph의 모든 frontier를 자동 병렬 실행한다.
- `--no-verify` 결과를 Wave 검증 없이 accepted completion으로 사용한다.
