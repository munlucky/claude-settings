# Capability Asset Base Freeze Baseline

- **Repository**: `munlucky/moonshot-relay`
- **Baseline Branch**: `main`
- **Baseline Commit**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **Captured Date**: 2026-09-04
- **Role**: Non-runtime Engineering Capability Asset Index
- **Phase Status**: Phase A (Capability Assetization) Complete / Ready for Phase B (Decomplexification)

---

## 1. 종합 자산 통계 (Summary Statistics)

| 지표 | 수치 | 비고 |
| :--- | :---: | :--- |
| **총 Capability 자산 수** | **15** | 35개 이상의 역사적 세부 기능을 15개 대표 패밀리로 통합 |
| **CORE** | **9** | 현재 Kernel 제품의 본질 경로 (Workflow & Knowledge) |
| **HOST** | **2** | Host/Provider 어댑터 및 패키지 설치 경계 |
| **OPTIONAL** | **2** | 독립 실행 및 명시적 선택 기반 생산성/학습 자산 |
| **LIBRARY** | **0** | 자체 완료 권위 없는 독립 라이브러리는 별도 자산화 유보 |
| **REFERENCE** | **1** | 하네스 표면 진단 및 회귀 관측 참조 자산 |
| **DEPRECATED** | **1** | 구 Relay phase runner (실패 교훈 보존, 재도입 금지) |
| **EXPERIMENTAL** | **0** | 미검증 자산 없음 |

---

## 2. 계보 및 검증 통계 (Lineage & Proof Metrics)

- **Relay-only 자산**: 0개 (모든 자산이 Kernel로 계승되었거나 아카이브 보존됨)
- **Kernel-only 자산**: 9개 (Kernel 도입 이후 신규 구축된 권위/상태/라우팅/최적화 자산)
- **Relay → Kernel 계승 자산**: 6개 (계약, 완료검증, 지식, 세션, 생산성, 하네스 진단)
- **중복 기능 통합 패밀리**: 15개 통합 자산군 (개별 세부 후보군을 패밀리 단위로 응집)
- **검증 증거(Proof) 없는 자산**: **0개** (전체 45개 테스트 경로가 실제 파일에 100% 바인딩됨)
- **불변 커밋(Immutable Commits) 검증**: **33개** Git SHA가 `git cat-file -e`로 유효성 확인 완료

---

## 3. 세대별 역사 구간 (Epochs Provenance)

- **E0 (Early Relay)**: `e0aa7a22a2bca953fee7805a8c6bf8c3956d867e` - 프로젝트 셋업, 설정 동기화
- **E1 (Workflow & Skill Relay)**: `77ed33f1e1f3c1f0c44216b86d9df5123e58cbb7` - 작업 계획, 분해, 스킬 라우터
- **E2 (Contract & Evidence Relay)**: `5ccf1c9ccfbf68ae8067d6e7e69a7555c782fdb5` - 완료 검증, 증거 기반 완료 권위
- **E3 (Architecture & Retro Relay)**: `1f7ed38b80f2d66d34498548448423c56154be16` - 아키텍처 하네스, 회고 루프
- **E4 (Kernel Introduction)**: `7806dd1870501a1171969ca8e13af8fbec26f892` - Moon Relay Kernel 소스 계약
- **E5 (Kernel Knowledge Lifecycle)**: `761a0d19dc8abdccd9d32469af79f0ec600d104f` - 프로젝트 지식 라이프사이클
- **E6 (Model & Provider Optimization)**: `01eac62a1c37b4b044704304992f38ef4c520603` - 논리 모델 라우팅, 프롬프트 최적화
- **E7 (Native Runtime & Execution-First)**: `30b317c0c8f0dee9b4a1c8f82f8b14fe30a7f692` - 오너 직접 실행, 릴레이 런타임 퇴역
- **E8 (Current Stabilized Kernel)**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e` - 최종 완료 권위 경계 보정

---

## 4. Decomplexification 인계 요약

후속 작업(Kernel Decomplexification)은 본 베이스라인을 기준으로 다음 분할 정책을 적용한다:
1. **Core 유지 (9개)**: Task Contract, Step Ledger, Evidence Completion, Mutation Guard, Project Identity, Knowledge Ingestion, Control Plane, Model Routing, Prompt Cache
2. **Host 분리 (2개)**: Provider Session Boundary, Account-root Profile Adoption
3. **Archive 격리 (4개)**: Standalone Tools, Retrospective, Harness Audit, Legacy Phase Runner

상세 인계 맵: [docs/capability-assets/decisions/decomplexification-maps.md](docs/capability-assets/decisions/decomplexification-maps.md)

---

## 5. 동결 선언 (Freeze Declaration)

본 문서는 Phase A 자산화 작업의 최종 결과물로서, 향후 기능 재도입 시 과거 구현과 실패 경험을 신속히 재참조할 수 있는 영구적 R&D 인덱스를 확정한다. 본 커밋 시점까지 생산 Kernel 코드에 대한 임의의 단순화, 삭제, 런타임 변경은 일절 수행되지 않았음을 보증한다.
