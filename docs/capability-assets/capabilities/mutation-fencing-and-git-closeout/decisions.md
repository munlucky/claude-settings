# Decisions & Failure History: Mutation fencing and Git closeout

- **Status**: `CORE`
- **Disposition**: `retain`

## Subcapabilities & Dispositions
- **`mutation-scope-safety`** -> `CORE` (Workflow: true, Knowledge: false)
- **`workspace-fencing`** -> `CORE` (Workflow: true, Knowledge: false)
- **`git-staging-safety`** -> `HOST` (Workflow: true, Knowledge: false)
- **`git-commit`** -> `HOST` (Workflow: true, Knowledge: false)
- **`remote-parity`** -> `OPTIONAL` (Workflow: true, Knowledge: false)

## 설계 및 보존 결정
신뢰 경계와 사용자 변경 보존을 동시에 지키는 현재 CORE capability다.

### 후속 조치
- 모든 future asset validator는 read-only여야 하며 generated state를 payload에 포함하지 않는다.

## 계보 및 세대 (Provenance)
- **First Seen**: E2 (`5ccf1c9ccfbf68ae8067d6e7e69a7555c782fdb5`, 2026-01-21)
- **Generations**:
  - **relay-mutation-check** (E2, `5ccf1c9ccfbf68ae8067d6e7e69a7555c782fdb5`): Relay verification boundary - 작업 후 변경과 검증을 분리했다.
  - **relay-lease-closeout** (E3, `1f7ed38b80f2d66d34498548448423c56154be16`): Lease and artifact closeout - phase lease, artifact와 closeout diagnostics를 추가했다.
  - **kernel-staging-policy** (E6, `01eac62a1c37b4b044704304992f38ef4c520603`): Kernel staging policy - staging, mutation guard와 remote parity를 Kernel 정책으로 분리했다.
  - **current-closeout** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Current closeout - owner binding, index integrity와 safe closeout을 결합했다.

## 알려진 결함 및 교훈 (Known Failures)
### prepared-state-contamination (P1)
- **현상**: 기존 dirty/prepared state가 새 작업의 mutation과 섞여 evidence와 closeout을 오염시킬 수 있었다.
- **원인**: workspace baseline과 mutation revision을 강하게 바인딩하지 않음.
- **교훈**: baseline, exact allowed paths, mutation revision과 index identity를 함께 기록한다.
- **수정 커밋**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **회귀 테스트**: `tests/kernel-flaky-and-selfmutation.test.mjs`, `tests/kernel-git-closeout-index-integrity.test.mjs`, `tests/kernel-mutation-fencing-remediation.test.mjs`
