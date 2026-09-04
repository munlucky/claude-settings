# Decisions & Failure History: Provider session and execution boundary

- **Status**: `HOST`
- **Disposition**: `retain`

## Subcapabilities & Dispositions
- **`host-session-binding`** -> `HOST` (Workflow: true, Knowledge: false)
- **`execution-capsule-transport`** -> `HOST` (Workflow: true, Knowledge: false)
- **`step-worktree-isolation`** -> `HOST` (Workflow: true, Knowledge: false)

## 설계 및 보존 결정
현재 Kernel의 provider-independent core와 Host-owned execution을 연결하는 HOST capability다.

### 후속 조치
- 새 transport는 local contract proof와 live host proof를 분리해 catalog에 표시한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E4 (`c93b6786c8ceb7a90f08d60f964d12f0b8b1cfa5`, 2026-07-22)
- **Generations**:
  - **kernel-runtime-boundary** (E4, `c93b6786c8ceb7a90f08d60f964d12f0b8b1cfa5`): Kernel runtime boundary - provider route와 installer/runtime lifecycle을 Kernel boundary로 분리했다.
  - **provider-session** (E7, `30b317c0c8f0dee9b4a1c8f82f8b14fe30a7f692`): Provider session - host session, session binding과 execution capsule을 구조화했다.
  - **current-host-owned-execution** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Host-owned execution - owner-direct execution과 provider receipt 경계를 명시했다.

## 알려진 결함 및 교훈 (Known Failures)
### external-session-uncertainty (P1)
- **현상**: provider auth, session 또는 transport가 준비되지 않으면 local process만으로 live execution을 입증할 수 없다.
- **원인**: 실행 주체와 외부 dependency의 상태가 Kernel process 밖에 있기 때문이다.
- **교훈**: HOST capability는 host-owned receipt가 없으면 verified live capability로 승격하지 않는다.
- **수정 커밋**: N/A
- **회귀 테스트**: `tests/kernel-network-policy.test.mjs`, `tests/kernel-execution-capsule-fresh-session.test.mjs`, `tests/kernel-host-loop-e2e.test.mjs`
