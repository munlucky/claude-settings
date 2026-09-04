# Decomplexification Transition Maps

이 문서는 Phase A (Capability Assetization)가 완료된 후 Phase B (Kernel Decomplexification)로 인계할 3대 핵심 맵을 정의한다.

## 1. Core Map (현재 Kernel에 반드시 유지할 본질)

현재 Kernel의 본질인 **AI Agent Workflow**와 **Project Knowledge Lifecycle**의 최소 실행/신뢰 권위를 담당하며 반드시 유지해야 할 핵심 자산 목록이다.

| Capability ID | Domain | Status | 역할 및 권위 |
| :--- | :--- | :--- | :--- |
| `task-contract-and-bounded-work` | WORK | CORE | 사용자 목적을 불변 계약과 제한된 work unit으로 바인딩 |
| `step-ledger-resume` | WORK | CORE | 작업 순서, 커서, resumable 진행 상태의 단일 권위 유지 |
| `evidence-completion-and-review-authority` | TRUST | CORE | 실증 증거, 보호된 책무, 리뷰 영수증 기반 완료 판정 |
| `mutation-fencing-and-git-closeout` | TRUST | CORE | 선언된 경로 외 변경 차단 및 Git closeout 안전성 보장 |
| `project-identity-and-knowledge-lifecycle` | KNOWLEDGE | CORE | 프로젝트 식별자, 지식 레코드, 개정 및 대체 라이프사이클 소유 |
| `knowledge-ingestion-and-evidence-graph` | KNOWLEDGE | CORE | 지식 정규화, 중복 제거, 충돌 검사, 온톨로지 게이팅 및 승격 |
| `control-plane-state-authority` | EXECUTION | CORE | 라이프사이클 전이, 상태 영속화, SQLite 어댑터 단일 권위 |
| `model-routing-and-route-admission` | INTELLIGENCE | CORE | 정책, 비용, 위험, 정체 기반 모델 라우팅 및 admission |
| `context-prompt-cache-and-optimization` | OPTIMIZATION | CORE | 문맥 빌드, 프롬프트 세그먼트, 캐시 안정성 및 다이제스트 보장 |

---

## 2. Extraction Map (Kernel에서 분리하여 Host로 이관할 후보)

Kernel의 본질 권위는 아니지만 실행과 환경 적응을 위해 필요하며, Host/Provider 계층으로 분리 관리해야 할 자산이다.

| Capability ID | Domain | Status | 분리 권장 레이어 | 이관 사유 및 가드레일 |
| :--- | :--- | :--- | :--- | :--- |
| `provider-session-and-execution-boundary` | EXECUTION | HOST | Host / Provider Adapter | 실제 외부 API 호출, 세션 유지, MCP 브릿지는 Host 책임. Local 단위 테스트와 Live Host 영수증 분리 필요. |
| `account-root-package-and-profile-adoption` | EXECUTION | HOST | Installer / Profile Manager | 프로필 materialization 및 계정 루트 설치는 배포/환경 어댑터 책임. Kernel 코어 런타임과 분리. |

---

## 3. Archive Map (현재 제품에서 제거/비활성 가능하며 필요 시 재도입할 자산)

현재 최소 Kernel 실행 표면에서는 제거하거나 외부 도구로 격리할 수 있으며, 향후 명시적 요구 발생 시 자산 인덱스를 참조하여 재도입할 후보이다.

| Capability ID | Domain | Status | 현재 상태 및 재도입 가이드 요약 |
| :--- | :--- | :--- | :--- |
| `standalone-architecture-and-research-tools` | PRODUCTIVITY | OPTIONAL | 아키텍처/리서치 도구는 독립 실행 가능. 런타임 완료 권위와 결합하지 않음. |
| `retrospective-and-regression-learning` | KNOWLEDGE | OPTIONAL | 일일 회고 및 개선 제안은 Advisory 성격. 런타임 상태 자동 승격 금지. |
| `harness-surface-and-regression-audit` | TRUST | REFERENCE | 테스트 표면 진단용 도구. 완료 판정 권위가 아닌 관측용 참조 자산. |
| `legacy-phase-runner-and-harness-adapters` | EXECUTION | DEPRECATED | 과거 Relay의 phase runner 구현. 아카이브 보존하며 새 계약 없이 재도입 불가. |
