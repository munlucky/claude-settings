# Capability Asset Base Freeze Baseline v2 Final

- **Repository**: `munlucky/moonshot-relay`
- **Baseline Branch**: `main`
- **Baseline Commit**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **Correction Commit**: `9132375bb7d6d56e20e557a4a91dee0f35efc0fa` (Baseline v2)
- **Captured Date**: 2026-09-05
- **Catalog Version**: 4
- **Baseline Version**: 2.1
- **Canonical Document**: `docs/capability-assets/CAPABILITY_ASSET_BASELINE.md` (단일 진실 원천)
- **Role**: Non-runtime Engineering Capability Asset Index
- **Phase Status**: Phase A (Capability Assetization) FINAL COMPLETE / Ready for Phase B (Decomplexification)

---

## 1. 종합 자산 통계 (Summary Statistics)

### A. Capability Family (15개)
| 상태 | 수량 | 비고 |
| :--- | :---: | :--- |
| **CORE** | 9 | 상위 대표 분류 (Workflow & Knowledge 중심) |
| **HOST** | 2 | Provider 세션 및 패키지 설치 경계 |
| **OPTIONAL** | 2 | 독립 도구 및 회고 학습 |
| **REFERENCE** | 1 | 하네스 표면 진단 |
| **DEPRECATED** | 1 | 구 Relay phase runner 아카이브 |
| **합계** | **15** | 35개 이상의 역사적 기능을 15개 응집 패밀리로 관리 |

### B. Subcapabilities (47개 — 100% 추적성 달성)
| 세부 Disposition | 수량 | 비율 | 의미 | 추적성 |
| :--- | :---: | :---: | :--- | :---: |
| **CORE** | **21** | 44.7% | Kernel 내부에 반드시 유지할 본질 권위 (계약, 원장, 증거, 지식, 전이 등) | 100% |
| **HOST** | **13** | 27.7% | Host Layer / Provider Adapter로 이관할 실행/환경 책임 (세션, 모델선택, 캐시) | 100% |
| **OPTIONAL** | **9** | 19.1% | 명시적 조건부 활성화 자산 (독립 리뷰어, 원격 패리티, 아키텍처 도구) | 100% |
| **REFERENCE** | **2** | 4.3% | 하네스 표면 예산 및 회귀 진단 참조 자산 | 100% |
| **DEPRECATED** | **2** | 4.3% | 과거 스플릿 브레인 결함으로 퇴역한 교훈 자산 | 100% |
| **합계** | **47** | 100% | 모든 Subcapability가 implementationRefs 및 proofRefs에 바인딩됨 | **100%** |

---

## 2. 역방향 커버리지 원장 (Coverage Ledger Metrics)

- **원장 파일**: [`docs/capability-assets/coverage-ledger.yaml`](coverage-ledger.yaml)
- **총 매핑 파일 수**: **719개**
- **Capability 매핑 파일**: **694개**
  - `scripts/kernel/**`: 149개 (100% 매핑 완료)
  - `kernel/**`: 14개 (100% 매핑 완료)
  - `schemas/kernel.*`: 31개 (100% 매핑 완료)
  - `tests/kernel-*.test.mjs`: 235개 (100% 매핑 완료)
  - `archive/scripts/legacy-phase-adapters/**`: 190개 (100% 매핑 완료)
  - `package/kernel/**`: 14개 (100% 매핑 완료)
  - `bin/moon-relay-*.mjs`, `bin/moonshot-relay.mjs`: 3개 (100% 매핑 완료)
  - 공식 카탈로그 및 재분류 Relay 스킬: 58개 (100% 매핑 완료)
- **명시적 제외(Ignored with Reason)**: **25개** (엄격한 3대 enum 사유 적용)
  - `generic-development-skill`: 16개 (일반 개발/설계 지식)
  - `external-domain-skill`: 7개 (특정 외부 프로젝트/도메인 도구)
  - `provider-specific-helper`: 2개 (단순 헬퍼)
- **미분류 파일(Unclassified)**: **0개 (100% 전수 커버리지 달성)**

---

## 3. 검증 증거 및 의미 (Proof Semantics)

- **Proof Reference Coverage**: **100%** (매니페스트에 기재된 45개 테스트 파일이 작업트리에 모두 실존함)
- **Proof Semantics Hardening**:
  - `proof.tests[]`에서 모호한 legacy `status` 필드 완전 제거 및 사용 금지
  - `referenceStatus`: `"verified"` (현 체크아웃 파일 존재 검증)
  - `executionStatus`: `"executed-pass"` (동결 시점 실실행 통과) / `"historical-pass"` (히스토리컬 회귀 증명)
- **Remote CI Status**: `not-verified` (로컬 체크아웃 베이스라인 동결)

---

## 4. Decomplexification 인계 요약 (v2.1)

후속 Decomplexification은 Family가 아닌 **47개 Subcapability**를 기준으로 집행한다:

1. **Tier 1 (Core Retain - 21개)**: Kernel 필수 유지 의미 불변량 (`task-contract-binding`, `work-unit-scope`, `run-step-ledger`, `work-cursor-resume`, `evidence-binding`, `verification-authority`, `completion-decision`, `protected-obligation`, `mutation-scope-safety`, `workspace-fencing`, `git-staging-safety`, `git-commit`, `project-identity-binding`, `knowledge-lifecycle-authority`, `knowledge-ingestion-normalization`, `ontology-gate-promotion`, `state-transition-authority`, `minimal-durable-state`, `host-session-binding`, `required-capability-contract`, `context-build`)
2. **Tier 2 (Host Delegate - 13개)**: Host/Adapter 레이어로 위임/이관 대상 (`package-materialization`, `account-profile-projection`, `route-admission`, `model-selection`, `provider-selection`, `prompt-envelope`, `prompt-cache`, `execution-capsule-transport`, `step-worktree-isolation` 등)
3. **Tier 3 (Optional Module - 9개)**: 필요 시에만 선택 로드하는 독립 모듈 (`independent-reviewer-execution`, `remote-parity`, `effort-cost-routing`, `stagnation-escalation`, `optimization-cycle`, `architecture-artifacts`, `codebase-understanding`, `standalone-diff-and-audit`, `improvement-proposals`)
4. **Tier 4 (Reference Only - 2개)**: 하네스 표면 및 회귀 진단 참조 (`harness-surface-budget`, `regression-audit-reporting`)
5. **Tier 5 (Deprecated / Strict Fence - 2개)**: 격리 유지 및 런타임 진입 금지 (`legacy-phase-runner`, `legacy-harness-adapters`)

---

## 5. 결론 및 동결 선언

본 Baseline v2 Final 문서는 구 Moonshot Relay부터 현 Moon Relay Kernel까지 축적된 15개 Capability Family와 47개 Subcapability의 **구현 소스, 불변 계약, 검증 테스트, 실패 이력, 재도입 가이드**를 완전히 결속했습니다.

Phase A (Capability Assetization)가 최종 완료되었으므로, 자산 손실 없이 안전하게 **Phase B (Kernel Decomplexification: 최소 `next/report` 런타임 단순화)**로 진행할 수 있습니다.
