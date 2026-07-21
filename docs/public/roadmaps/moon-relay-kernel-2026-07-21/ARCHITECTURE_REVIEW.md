# Moon Relay Kernel Architecture Review

Date: 2026-07-21  
Review status: accepted with bounded follow-up

## 1. Review Inputs

- Moon Relay Kernel initial strategy and naming discussion
- uploaded deep review of the proposed architecture
- web validation of GSD, Spec Kit, BMAD, Matt Pocock Skills, Ponytail, Superpowers, OpenAI Harness Engineering, SQLite behavior
- current Moonshot Relay runtime-state, completion authority, installer, package, context builder, skill and plan-writer contracts

## 2. Accepted Strengths

- prompt-heavy control에서 environment and contract 중심 제어로 전환
- one public entrypoint와 thin orchestrator
- stage-scoped context compiler와 progressive disclosure
- Ponytail의 minimality ladder를 safety exclusion과 함께 사용
- Matt Pocock의 domain vocabulary, tracer slicing, spec/standards review 축 활용
- fresh context를 작업 경계와 독립 리뷰에 적용
- 실행 완료를 모델 주장 대신 runtime evidence로 판정
- Relay의 runtime, sandbox, installer, managed Node, completion authority를 재사용

## 3. Review Findings and Decisions

### F-01 SQLite와 파일 상태의 split-brain 위험

Decision: accepted problem / rejected proposed remedy.

SQLite를 폐지하지 않는다. 파일과 DB가 동일 상태를 수정하지 못하도록 authority를 분리한다. 파일은 intent, SQLite는 execution/completion, 상태 파일은 one-way projection이다.

Expected effect:

- lease와 completion 원자성 유지
- 사람이 읽을 수 있는 상태 제공
- 양방향 동기화 제거

### F-02 Wave execution 부재

Decision: accepted with staged adoption.

Task DAG와 wave planner는 필요하다. 다만 초기 구현의 기본값은 sequential이며 v1은 dry-run과 충돌 분석부터 제공한다. 실제 병렬 실행은 maxWorkers=2, 독립 write-set, deterministic merge, integration verification을 충족할 때만 활성화한다.

Expected effect:

- 안전한 작업만 wall-clock 단축
- 초기 scheduler 복잡성 제한
- 순차 fallback 유지

### F-03 고정 3축 리뷰 오버헤드

Decision: accepted.

T0~T3 Risk-Adaptive Proof Pipeline으로 변경한다. 단순 작업은 deterministic-only, 일반 작업은 compact 또는 dual review, 고위험 작업만 full proof를 사용한다.

Expected effect:

- 작은 작업 비용 감소
- 고위험 변경의 독립 관점 유지

### F-04 Pattern Transfer의 upstream 단절

Decision: accepted problem / modified remedy.

자동 동기화하지 않는다. Managed Upstream Registry로 pin, diff, eval, proposal, human approval을 사용한다. 핵심 스킬은 derived, 선택형은 wrapped, 개인 실험은 subscribed로 분류한다.

Expected effect:

- 재현성과 공급망 안전 유지
- upstream 개선 탐지
- 모델별 회귀 방지

### F-05 추적성 상실

Decision: accepted.

전체 문서 체인을 기본 강제하지 않되 E0~E2 Conditional Evidence Pack을 도입한다. 다중 슬라이스와 고위험 작업은 requirement → slice → evidence → completion decision을 RELEASE_EVIDENCE로 합성한다.

Expected effect:

- 문서량 감소
- 릴리스 수준 책임성과 복구 가능성 유지

### F-06 50%/70% context threshold

Decision: rejected as a universal invariant.

모델·작업별로 달라지는 휴리스틱을 hard-coded policy로 사용하지 않는다. slice boundary, repeated failure, trust boundary, context budget, stale evidence 신호로 fresh context를 선택한다.

### F-07 모든 단계의 fresh agent

Decision: rejected.

동일 bounded objective의 red-green loop는 현재 context를 유지한다. 새 slice, 독립 reviewer, 오염 신호, provider boundary에서만 fresh context를 사용한다.

### F-08 모든 FRAME에서 grilling

Decision: modified acceptance.

acceptance, data, security, contract를 바꾸는 모호성에만 질문한다. 나머지는 repository convention과 conservative assumption으로 진행한다.

## 4. Architecture Readiness

| Gate | Status | Evidence |
|---|---|---|
| product boundary | ready | ADR-0001 |
| state authority | ready | ADR-0002 |
| proof/evidence policy | ready | ADR-0003 |
| external skill and scheduler policy | ready | ADR-0004 |
| traceability | ready | TRACEABILITY_MATRIX.md |
| implementation phase boundaries | ready | 00-master-plan and phase docs |
| profile/account-root mutation | controlled adoption only | PH-07 |
| source implementation completion | not claimed | runtime evidence required |

## 5. Remaining Risks

- actual package path names may require adjustment after Phase 01 repository inventory
- risk classifier thresholds require A/B calibration
- predicted write-set may under-detect semantic conflicts
- Codex app worktree hydration behavior must be tested on current app versions
- managed Node artifact size and install time may affect distribution
- long-lived branch sync cost may trigger a later separate-repository decision

These are implementation risks, not architecture blockers. Each is assigned to a phase and evidence slot.

## 6. Review Decision

Architecture package status: `ready`

The package may proceed to phased source implementation on `kernel/moon-relay-kernel`. Live account-root/profile adoption remains blocked until PH-07 prerequisites and dry-run evidence pass.
