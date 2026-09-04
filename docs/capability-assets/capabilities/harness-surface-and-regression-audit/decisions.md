# Decisions & Failure History: Harness surface and regression audit

- **Status**: `REFERENCE`
- **Disposition**: `retain`

## 설계 및 보존 결정
자산화 자체와 future decomplexification에서 surface drift를 관찰하는 REFERENCE capability로 유지한다.

### 후속 조치
- budget baseline 변경은 반드시 source count와 reason을 함께 갱신한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E2 (`4836e14ed180fae8a9034f2c06b884cb7a994db6`, 2026-02-10)
- **Generations**:
  - **relay-harness-surface** (E2, `4836e14ed180fae8a9034f2c06b884cb7a994db6`): Relay harness surface - agent loop와 test surface를 관찰하고 회귀를 감지했다.
  - **archived-surface-inventory** (E3, `1f7ed38b80f2d66d34498548448423c56154be16`): Archived inventory - tracked files, test registration과 harness overhead를 계량화했다.
  - **current-surface-report** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Current surface report - harness report와 explicit budget으로 regression surface를 검증한다.

## 알려진 결함 및 교훈 (Known Failures)
### stale-harness-budget (P1)
- **현상**: 현재 tracked main과 일치하지 않는 stale baseline 때문에 asset 문서 추가가 false regression으로 판정될 수 있었다.
- **원인**: budget baseline이 clean tracked surface에서 재측정되지 않았다.
- **교훈**: baseline은 측정 대상과 allowed delta를 명시하고 변경 이유를 asset inventory에 기록한다.
- **수정 커밋**: `assetization-working-tree-2026-09-04`
- **회귀 테스트**: `tests/harness-surface-report-contract.test.mjs`, `tests/harness-regression-contract.test.mjs`
