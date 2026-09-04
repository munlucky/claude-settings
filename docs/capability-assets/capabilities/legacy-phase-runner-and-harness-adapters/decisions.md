# Decisions & Failure History: Legacy phase runner and harness adapters

- **Status**: `DEPRECATED`
- **Disposition**: `archive`

## Subcapabilities & Dispositions
- **`legacy-phase-runner`** -> `DEPRECATED` (Workflow: true, Knowledge: false)
- **`legacy-harness-adapters`** -> `DEPRECATED` (Workflow: true, Knowledge: false)

## 설계 및 보존 결정
Relay 역사와 실패 교훈은 보존하지만 현재 Kernel runtime에 재도입하지 않는다.

### 후속 조치
- decomplexification은 이 asset을 근거로 별도 승인·계약·migration 계획에서만 수행한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E1 (`1131912154b8c4e2c077f81bc7ee15fee440d302`, 2026-02-05)
- **Generations**:
  - **relay-phase-runner** (E1, `1131912154b8c4e2c077f81bc7ee15fee440d302`): Moonshot phase runner - phase plan, attempt, lease와 runner를 공개 workflow surface로 운영했다.
  - **relay-archived-adapters** (E3, `1f7ed38b80f2d66d34498548448423c56154be16`): Archived phase adapters - phase runtime/artifact/harness와 AWTL adapter가 archive로 보존됐다.
  - **kernel-retirement** (E7, `30b317c0c8f0dee9b4a1c8f82f8b14fe30a7f692`): Retired Relay runtime - Kernel step ledger와 owner-direct 실행으로 predecessor runtime을 대체했다.

## 알려진 결함 및 교훈 (Known Failures)
### phase-adapter-split-brain (P1)
- **현상**: phase, attempt, lease, artifact와 harness adapter가 서로 다른 실행 상태를 나타낼 수 있었다.
- **원인**: 여러 Relay adapter가 lifecycle authority를 중복 소유했다.
- **교훈**: 현재는 Kernel step ledger/control plane을 단일 authority로 사용하고 legacy는 비교용으로만 둔다.
- **수정 커밋**: `30b317c0c8f0dee9b4a1c8f82f8b14fe30a7f692`
- **회귀 테스트**: `tests/kernel-run-step-ledger.test.mjs`, `tests/kernel-no-relay-db-migration.test.mjs`
