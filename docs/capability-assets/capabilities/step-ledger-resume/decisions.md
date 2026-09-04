# Decisions & Failure History: Step ledger and resume

- **Status**: `CORE`
- **Disposition**: `retain`

## 설계 및 보존 결정
Relay의 phase 진행 자산을 Kernel의 단일 step ledger로 통합해 보존할 가치가 있는 CORE capability다.

### 후속 조치
- legacy phase runner를 재도입하지 말고 step-level compatibility가 필요한지 별도 계약으로 판단한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E1 (`77ed33f1e1f3c1f0c44216b86d9df5123e58cbb7`, 2026-01-21)
- **Generations**:
  - **relay-phase-plan** (E1, `77ed33f1e1f3c1f0c44216b86d9df5123e58cbb7`): Relay workflow state - phase 중심 계획과 workflow 순서를 표현했다.
  - **legacy-phase-ledger** (E3, `1f7ed38b80f2d66d34498548448423c56154be16`): Archived phase runner - phase attempt, lease, artifact와 resume 보조 상태를 확장했다.
  - **step-ledger** (E6, `9e929f98037bc427a7707dbf844568d3eb39d99f`): Kernel step ledger - wave/phase 상태를 bounded step과 work cursor로 압축했다.
  - **execution-first-resume** (E8, `f6b72ffadff8151caf2be2a87508f66a0d4b3d5e`): Resume view - run locator, baseline과 resume view를 현재 실행 경계에 연결했다.

## 알려진 결함 및 교훈 (Known Failures)
### legacy-phase-split-brain (P1)
- **현상**: phase artifact, lease, runner 상태가 서로 다른 cursor를 가리킬 수 있었다.
- **원인**: 계획·실행·상태 저장이 여러 adapter에 중복되었다.
- **교훈**: 하나의 step ledger와 owner binding을 completion 경로의 기준으로 삼아야 한다.
- **수정 커밋**: `30b317c0c8f0dee9b4a1c8f82f8b14fe30a7f692`
- **회귀 테스트**: `tests/kernel-run-step-ledger.test.mjs`, `tests/kernel-run-step-resume.test.mjs`
