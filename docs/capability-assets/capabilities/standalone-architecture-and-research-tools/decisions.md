# Decisions & Failure History: Standalone architecture and research tools

- **Status**: `OPTIONAL`
- **Disposition**: `retain`

## 설계 및 보존 결정
구현 품질을 보조하는 OPTIONAL productivity capability로 보존하되 runtime authority와 분리한다.

### 후속 조치
- 새 standalone tool은 artifact schema와 authority disclaimer를 함께 제공한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E3 (`1f7ed38b80f2d66d34498548448423c56154be16`, 2026-06-09)
- **Generations**:
  - **relay-context-helper** (E3, `1f7ed38b80f2d66d34498548448423c56154be16`): Relay planning helpers - context builder와 architecture/research 보조 문서 surface를 운영했다.
  - **standalone-kernel-tools** (E7, `30b317c0c8f0dee9b4a1c8f82f8b14fe30a7f692`): Standalone tools - architecture, product, diff, UI audit과 project memory를 provider-neutral command로 분리했다.
  - **current-advisory-surface** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Advisory standalone - standalone 결과를 별도 artifact와 binding 없이는 runtime authority로 승격하지 않는다.

## 알려진 결함 및 교훈 (Known Failures)
### advisory-authority-confusion (P2)
- **현상**: standalone plan/research artifact가 실행 또는 completion authority처럼 해석될 수 있었다.
- **원인**: advisory artifact와 runtime/control-plane ownership의 경계가 문서와 schema에 약했다.
- **교훈**: artifact provenance, binding과 authority boundary를 명시하고 자동 promotion을 금지한다.
- **수정 커밋**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **회귀 테스트**: `tests/architecture-contract-bind.test.mjs`, `tests/kernel-standalone-project-knowledge.test.mjs`, `tests/research-evidence-contract.test.mjs`
