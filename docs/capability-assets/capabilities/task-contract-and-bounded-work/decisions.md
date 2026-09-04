# Decisions & Failure History: Task contract and bounded work

- **Status**: `CORE`
- **Disposition**: `retain`

## Subcapabilities & Dispositions
- **`task-contract-binding`** -> `CORE` (Workflow: true, Knowledge: false)
- **`work-unit-scope`** -> `CORE` (Workflow: true, Knowledge: false)

## 설계 및 보존 결정
현재 Kernel의 실행 경계와 재현 가능한 작업 단위를 지탱하는 CORE capability다.

### 후속 조치
- 새 capability를 추가할 때 contract owner와 completion owner를 분리해 기록한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E2 (`5ccf1c9ccfbf68ae8067d6e7e69a7555c782fdb5`, 2026-01-21)
- **Generations**:
  - **relay-workflow** (E1, `77ed33f1e1f3c1f0c44216b86d9df5123e58cbb7`): Relay workflow - 계획, skill 조합, workflow 규칙을 사용자 작업에 바인딩했다.
  - **relay-completion-contract** (E2, `5ccf1c9ccfbf68ae8067d6e7e69a7555c782fdb5`): Completion contract - 완료 조건과 검증 계약을 명시적인 작업 경계로 승격했다.
  - **kernel-contract** (E4, `7806dd1870501a1171969ca8e13af8fbec26f892`): Kernel contract - task contract schema와 Kernel policy로 실행 전 계약을 분리했다.
  - **execution-first-contract** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Execution-first contract - owner-direct 실행과 bounded work unit을 현재 완료 권위에 연결했다.

## 알려진 결함 및 교훈 (Known Failures)
### contract-scope-drift (P1)
- **현상**: 작업 중 contract를 다시 발행하면 이미 진행한 cursor와 baseline이 어긋날 수 있다.
- **원인**: 계약 변경을 단순 설정 변경으로 취급하고 기존 binding을 보존하지 않음.
- **교훈**: scope 변경은 명시적 replan 경로로만 수행하고 기존 증거를 재검증해야 한다.
- **수정 커밋**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **회귀 테스트**: `tests/kernel-run-step-replan.test.mjs`, `tests/kernel-contract-preflight-continuation.test.mjs`
