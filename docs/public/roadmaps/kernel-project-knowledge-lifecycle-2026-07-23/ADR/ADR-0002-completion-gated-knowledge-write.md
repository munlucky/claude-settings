# ADR-0002: Completion-Gated Project Knowledge Write

- Status: Accepted for implementation plan
- Date: 2026-07-23

## Context

작업 중 발견된 내용은 추측, 임시 환경 상태, 실패한 접근, stale evidence를 포함할 수 있다. 이를 즉시 semantic fact, ontology constraint, policy anchor로 저장하면 다음 작업의 판단을 오염시키고 잘못된 규칙을 자기 강화한다.

Kernel은 이미 runtime-state DB와 fresh verifier evidence를 completion authority로 사용한다. 프로젝트 지식 쓰기도 이 권한 체계 뒤에 배치해야 한다.

## Decision

- 작업 중 발견은 우선 run-bound `knowledge_candidate` 또는 `episodic_observation`으로 저장한다.
- verified knowledge write는 `assessCompletion(..., commitDecision: true)`가 `accepted`를 반환한 뒤에만 허용한다.
- candidate는 source identity, mutation revision, source refs, acceptance coverage, verification evidence에 바인딩한다.
- candidate별 type-specific 검증을 통과해야 semantic/KG/ontology/policy record가 된다.
- concurrent knowledge revision은 자동 overwrite하지 않고 conflict/re-review로 전환한다.
- knowledge commit은 atomic record write 후 revision manifest를 마지막에 증가시킨다.
- knowledge commit receipt는 post-completion lineage이며 completion authority가 아니다.

## Consequences

### Positive

- 실패한 시도와 검증된 지식 분리
- false memory promotion 방지
- 작업 결과와 지식 revision의 감사 가능성
- supersession과 rollback의 명시적 근거 확보

### Negative

- accepted completion 전에는 reusable knowledge가 즉시 반영되지 않음
- closeout 단계가 추가됨
- concurrent run에서 re-review가 필요할 수 있음

## Edge Cases

- accepted completion 후 knowledge write 실패: completion은 유지하되 warning/strict closeout blocker 기록
- no-change task: `no_change` receipt 생성, revision 증가 없음
- docs-only authoritative change: source document는 이미 Git source of truth이며 knowledge index는 derived refresh로 처리
- transcript/tool-only candidate: quarantined/rejected

## Rejected Alternatives

1. EXECUTE 중 즉시 MemoryGraph write: 검증 전 오염 위험
2. Git commit 시점만으로 knowledge 검증: Git history와 runtime completion authority 혼동
3. LLM confidence만으로 승격: deterministic evidence 부족

## Verification

- pre-acceptance write rejection
- stale verification/source identity mismatch
- accepted/no-change/conflict/failure matrix
- fault injection and revision atomicity
- receipt digest tamper detection