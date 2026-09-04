# Decisions & Failure History: Model routing and route admission

- **Status**: `CORE`
- **Disposition**: `retain`

## Subcapabilities & Dispositions
- **`required-capability-contract`** -> `CORE` (Workflow: true, Knowledge: false)
- **`route-admission`** -> `CORE` (Workflow: true, Knowledge: false)
- **`model-selection`** -> `HOST` (Workflow: true, Knowledge: false)
- **`provider-selection`** -> `HOST` (Workflow: true, Knowledge: false)
- **`effort-cost-routing`** -> `HOST` (Workflow: true, Knowledge: false)
- **`stagnation-escalation`** -> `OPTIONAL` (Workflow: true, Knowledge: false)

## 설계 및 보존 결정
현재 multi-stage Kernel의 선택과 비용·위험 경계를 담당하는 CORE capability다.

### 후속 조치
- 새 route는 benchmark보다 먼저 admission invariant와 failure boundary를 추가한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E6 (`01eac62a1c37b4b044704304992f38ef4c520603`, 2026-07-25)
- **Generations**:
  - **logical-model-routing** (E6, `01eac62a1c37b4b044704304992f38ef4c520603`): Logical model routing - stage별 logical model class와 Host 실행 기록을 도입했다.
  - **provider-aware-routing** (E6, `9e929f98037bc427a7707dbf844568d3eb39d99f`): Provider-aware routing - provider capability와 model usage를 route 판단에 반영했다.
  - **route-admission** (E7, `30b317c0c8f0dee9b4a1c8f82f8b14fe30a7f692`): Route admission - capability, risk, stagnation과 evidence 조건을 admission gate로 묶었다.
  - **current-adaptive-route** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Adaptive route - 실패 분류와 owner-direct execution을 route lifecycle에 연결했다.

## 알려진 결함 및 교훈 (Known Failures)
### route-without-capability-proof (P1)
- **현상**: 선택한 model/provider가 required capability와 evidence 조건을 충족하지 않아도 실행될 수 있었다.
- **원인**: routing preference와 admission policy가 분리되어 우회 가능했다.
- **교훈**: route는 capability resolver, policy와 usage receipt를 함께 통과해야 한다.
- **수정 커밋**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **회귀 테스트**: `tests/kernel-route-admission.test.mjs`, `tests/kernel-route-admission-e2e.test.mjs`, `tests/kernel-model-routing-e2e.test.mjs`
