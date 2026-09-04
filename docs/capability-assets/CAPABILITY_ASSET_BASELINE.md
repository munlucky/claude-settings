# Capability Asset Base Freeze Baseline v2

- **Repository**: `munlucky/moonshot-relay`
- **Baseline Branch**: `main`
- **Baseline Commit**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **Correction Commit**: `8744a3d5491a00dd0f42bc0f2758a1ec66458550` (Baseline v1)
- **Captured Date**: 2026-09-04
- **Catalog Version**: 3
- **Baseline Version**: 2
- **Canonical Document**: `docs/capability-assets/CAPABILITY_ASSET_BASELINE.md` (단일 진실 원천)
- **Role**: Non-runtime Engineering Capability Asset Index
- **Phase Status**: Phase A (Capability Assetization) Baseline v2 Complete / Ready for Phase B (Decomplexification)

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

### B. Subcapabilities (47개 — Decomplexification 실제 판단 단위)
| 세부 Disposition | 수량 | 비율 | 의미 |
| :--- | :---: | :---: | :--- |
| **CORE** | **21** | 44.7% | Kernel 내부에 반드시 유지할 본질 권위 (계약, 원장, 증거, 지식, 전이, 라우트 게이트, 문맥) |
| **HOST** | **13** | 27.7% | Host Layer / Provider Adapter로 이관할 실행/환경 책임 (세션, 모델선택, 와이어포맷, 캐시) |
| **OPTIONAL** | **9** | 19.1% | 명시적 조건부 활성화 자산 (독립 리뷰어, 원격 패리티, 정체 에스컬레이션, 아키텍처 도구) |
| **REFERENCE** | **2** | 4.3% | 하네스 표면 예산 및 회귀 진단 참조 자산 |
| **DEPRECATED** | **2** | 4.3% | 과거 스플릿 브레인 결함으로 퇴역한 교훈 자산 |
| **합계** | **47** | 100% | 15개 전체 Family에 걸쳐 100% 명시적으로 정의됨 |

---

## 2. 역방향 커버리지 원장 (Coverage Ledger Metrics)

- **원장 파일**: [`docs/capability-assets/coverage-ledger.yaml`](coverage-ledger.yaml)
- **총 매핑 파일 수**: **719개**
- **Capability 매핑 파일**: **665개**
  - `scripts/kernel/**`: 149개 (100% 매핑 완료)
  - `kernel/**`: 14개 (100% 매핑 완료)
  - `schemas/kernel.*`: 31개 (100% 매핑 완료)
  - `tests/kernel-*.test.mjs`: 235개 (100% 매핑 완료)
  - `archive/scripts/legacy-phase-adapters/**`: 190개 (100% 매핑 완료)
  - `package/kernel/**`: 14개 (100% 매핑 완료)
  - `bin/moon-relay-*.mjs`, `bin/moonshot-relay.mjs`: 3개 (100% 매핑 완료)
  - 공식 카탈로그 스킬: 29개 (100% 매핑 완료)
- **명시적 제외(Ignored with Reason)**: **54개** (일반 프롬프트/가이드 스킬, 사유 필수 명시)
- **미분류 파일(Unclassified)**: **0개 (100% 전수 커버리지 달성)**

---

## 3. 검증 증거 및 의미 (Proof Semantics)

- **Proof Reference Coverage**: **100%** (매니페스트에 기재된 45개 테스트 파일이 작업트리에 모두 실존함)
- **Proof Execution at Freeze**:
  - `executed-pass`: 자산화 및 표면 예산 검증기 통과
  - `historical-pass`: 43개 세부 회귀 테스트 (과거 에포크 및 베이스라인에서 통과 증명 보존)
- **Remote CI Status**: `not-verified` (로컬 체크아웃 베이스라인 동결)

---

## 4. Decomplexification 인계 요약 (v2)

후속 Decomplexification은 Family가 아닌 **47개 Subcapability**를 기준으로 집행한다:
1. **Kernel Core (21개 유지)**: Task Contract, Work Unit Scope, Step Ledger, Work Cursor, Evidence Binding, Verification Authority, Completion Gate, Protected Obligation, Mutation Safety, Workspace Fence, Project Identity, Knowledge Store, Ingestion, Ontology Gate, Control Plane State, SQLite Adapter, Required Capability, Route Admission, Context Build, Knowledge Context Selection, Context Freshness
2. **Host Extraction (13개 이관)**: Review Transport, Git Staging, Git Commit, Host Session, Execution Capsule, Worktree Isolation, Model Selection, Provider Selection, Effort/Cost Routing, Prompt Envelope, Prompt Cache, Package Materialization, Profile Projection
3. **Optional / Archive (13개 격리/보관)**: Independent Reviewer Execution, Remote Parity, Stagnation Escalation, Optimization Cycle, Architecture Artifacts, Codebase Understanding, Diff/Audit Tools, Daily Retro, Improvement Proposals, Harness Audit, Legacy Phase Runner

상세 인계 맵: [docs/capability-assets/decisions/decomplexification-maps.md](decisions/decomplexification-maps.md)

---

## 5. 최종 동결 선언 (Freeze Declaration v2)

본 Baseline v2는 정합성, 전수 커버리지 원장(`unclassified=0`), 47개 Subcapability 세분화, Proof 의미 분리 및 루트 중복 제거를 모두 완결한 최종 엔지니어링 인덱스다. 커널 생산 런타임 코드는 전혀 변경되지 않았으며, 안전하게 Phase B (Kernel Decomplexification)를 시작할 수 있음을 보증한다.
