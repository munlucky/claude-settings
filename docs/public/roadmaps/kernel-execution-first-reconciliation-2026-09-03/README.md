# Moonshot Relay Kernel — Execution-First Context / Knowledge Lifecycle 최종 개선 작업계획서

**문서 상태:** Approved Final Implementation Plan (Post Grill-Me Consolidation)  
**대상:** `munlucky/moonshot-relay` Kernel Mode  
**기준 브랜치:** `main`  
**기준 최신 커밋:** `f6b72ffadff8151caf2be2a87508f66a0d4b3d5e`  
**주요 실행 표면:** Codex App / Codex CLI / Claude App / Claude CLI / Antigravity App / Qwen Code CLI  
**최우선 제품 목표:** N개 프로젝트 × N개 worktree × N개 session이 동시 실행되어도 Context / Knowledge / Memory lifecycle이 오염되지 않고, Harness 사전 제약으로 인해 사용자의 구현 작업이 시작부터 중단되지 않는다.

---

## 1. 아키텍처 개요 및 핵심 원칙

### 1.1 최종 아키텍처 구조

```text
사용자 요청
   ↓
최소 Context Bootstrap (Turn 0)
   ├─ 가벼운 Task Contract 전달 (`kernel next --contract-json`)
   ├─ Fail-soft AllowedPaths (작업트리 내부 기본 허용)
   └─ Locator 모호 시: 기존 Run 오결합 방지 및 '현재 세션용 신규 Run' 즉시 발급
   ↓
Native Agent가 즉시 구현 (EXECUTE)
   ├─ 코드 분석, 파일 수정, 로컬 테스트 자유 진행
   └─ Kernel은 변경사항과 베이스라인을 추적
   ↓
구현 완료 보고 (`kernel report`)
   ↓
Final Reconciliation (PROVE & CLOSE)
   ├─ Baseline vs Current Workspace 실제 Git Diff 기반 변경 경로 확정
   ├─ Command Catalog 동적 새로고침(Refresh) 및 Kernel 직접 검증 실행 (Canonical Execution)
   ├─ 독립 리뷰어 부재 시: Native Subagent 리뷰(`action: review, mode: subagent`) 연동
   ├─ 지식(Knowledge) CAS 커밋 (최대 3회 재시도, 충돌 지속 시 deferred 처리 후 Git Closeout 완료)
   └─ 최종 완료 판정 (Evidence-based Completion Authority)
```

### 1.2 핵심 불변식 (Invariants)

1. **Execution First, Reconciliation Later**: 안전한 프로젝트/작업트리가 확인되면 즉시 구현을 시작한다.
2. **Wrong Binding보다 No Binding / New Binding**: 모호한 기존 Run을 추측하여 연결하지 않는다. 모호할 경우 현재 세션에 깨끗한 신규 Run을 발급하여 추적한다.
3. **Safety Boundary만 시작을 차단**: Path Traversal(`..`), 저장소 외부 탈출, 명백한 워크스페이스 오너십 위반만 Hard Gate로 차단한다.
4. **Evidence Authority 보존**: 완료 판정은 모델의 주장이 아닌 Kernel의 직접 검증 영수증과 독립 리뷰 영수증을 기준으로 한다.
5. **Code Delivery와 Knowledge 영속화의 분리**: 지식 CAS 충돌로 지식이 `deferred`되더라도 검증 완료된 코드의 Git Closeout은 정상 완료한다.
6. **Session Survival**: 동일 작업트리에 복수 Writer가 접근해도 세션을 강제 종료하지 않고 Read-Only/Analysis 모드로 생존시킨다.

---

## 2. 인터뷰를 통해 확정된 7대 핵심 설계 결정

1. **세션 시작 및 Unresolved Locator (Branch 1)**:
   - 에이전트는 Turn 0에 가벼운 contract로 `kernel next --contract-json`을 호출한다.
   - Locator가 ambiguous(동일 작업트리에 이전 run 다수)하거나 stale할 때, 임의의 기존 run을 추측하지 않고 **현재 세션을 위한 신규 Run을 즉시 발급**하여 baseline을 정상 캡처하고 SQLite에 기록한다.
2. **Work-Unit Scope & Mutation Fencing (Branch 2)**:
   - Turn 0에서는 path traversal(`..` 등)만 Hard Gate로 차단한다.
   - `allowedPaths`가 비어있거나 모호하더라도 작업트리 내부라면 **Fail-soft로 허용**하고, Final Reconciliation(`report`) 시점에 실제 git diff를 기반으로 변경 경로를 확정 및 바인딩한다.
3. **Verification 실행 권위 & Late Catalog Refresh (Branch 3)**:
   - 검증 명령은 Kernel의 증거 권위(Principle 5)를 위해 **PROVE 시점에 Kernel이 직접 하위 프로세스로 실행(canonical execution)**한다.
   - 구현 중 추가된 테스트 스크립트를 반영하기 위해 PROVE 진입 시 **Command Catalog를 동적으로 새로고침(refresh)**하여 바인딩하며, 실행 가능한 명령이 끝내 없으면 실패 대신 `verification: pending`으로 안전 처리한다.
4. **Knowledge CAS 충돌 & Git Closeout 분리 (Branch 4)**:
   - 코드 배포와 지식 영속화를 분리(원칙 6)한다.
   - 최대 3회 CAS 재시도 후에도 충돌이 지속되어 `deferred`가 되더라도, 검증이 완료된 코드의 **Git Closeout은 정상 완료**한다.
   - 미반영 지식 후보는 DB에 안전하게 보존하여 후속 Run 또는 지식 유지보수 시점에 재처리한다.
5. **동일 작업트리 동시 접근 시 세션 생존 (Branch 5)**:
   - 동일 worktree에 이미 활성 Writer가 있으면 `kernel next`는 세션을 에러로 종료하지 않고 **`read-only / analysis` 액션(컨텍스트·지식 조회 가능)**을 반환한다.
   - 변이 시도 시 '별도 worktree 생성' 권고 안내와 함께 안전하게 차단한다.
6. **독립 리뷰어 부재 시 독립 서브에이전트 리뷰 연동 (Branch 6 & 7)**:
   - PROVE 단계에서 Host의 외부 리뷰어 트랜스포트가 없을 때, `kernel next`가 `action: { type: 'review', mode: 'subagent' }`를 발행한다.
   - Host Native Agent가 서브에이전트(예: `invoke_subagent`)를 호출하여 격리된 세션 ID(`actorSessionId`)로 리뷰를 수행하고 `kernel report`로 영수증을 제출한다.
   - 서브에이전트가 지원되지 않는 환경에서만 `review: pending`으로 처리한다.

---

## 3. 구현 단계별 세부 계획 (Wave 0 ~ Wave 7)

### Wave 0 — Execution-First 기준선 고정 (Baseline Pinning)
* **목표**: 현재 Kernel의 보안 및 증거 권위(Fencing, Project Isolation, Evidence Freshness)가 깨지지 않도록 회귀 기준선을 테스트로 명문화.
* **작업 내용**:
  * `tests/kernel-execution-first-baseline.test.mjs` 신규 작성.
  * Project A 지식 != Project B 지식, Worktree A != Worktree B 격리 확인.
  * Stale Review, Stale Evidence 거부 동작 확인.

### Wave 1 — Blocker Classification & Slim Preflight
* **목표**: 사전 계약 검증(Contract Preflight)의 Hard Gate를 최소화하고, 안전하지 않은 경로 외에는 모두 Fail-soft/Deferred로 전환.
* **수정 대상**:
  * [scripts/kernel/run/contract-preflight.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/run/contract-preflight.mjs): verification missing, step binding incomplete를 Hard Reject에서 제외.
  * [scripts/kernel/run/work-unit-scope.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/run/work-unit-scope.mjs): Turn 0에서 `allowedPaths` 미선언 시 작업트리 기본 허용.
  * [scripts/kernel/control-plane.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/control-plane.mjs): `cp.next()` turn-0 scope-rejected 가드 완화.
* **테스트**: `tests/kernel-preflight-execution-first.test.mjs`

### Wave 2 — Fail-Soft Context Bootstrap
* **목표**: 컨텍스트 영수증 누락이나 프로젝션 손상 시에도 최선의 컨텍스트를 제공하고 구현을 차단하지 않음.
* **수정 대상**:
  * [scripts/kernel/context-build.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/context-build.mjs): Degraded 컨텍스트 상태 허용.
  * [scripts/kernel/knowledge/context-load.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/knowledge/context-load.mjs): SQLite authoritative store 직결 fallback.
* **테스트**: `tests/kernel-context-bootstrap-degraded.test.mjs`

### Wave 3 — Run Locator / Session Binding Deferred Reconciliation
* **목표**: Locator가 stale/ambiguous할 때 프로세스가 중단되지 않고, 현재 세션을 위한 신규 Run을 즉시 발급하여 진행.
* **수정 대상**:
  * [bin/moon-relay-kernel.mjs](file:///c:/dev/moonshot-relay/bin/moon-relay-kernel.mjs): `runtimeBindingDiscoveryError` 사전 throw 제거, ambiguous 플래그 전달.
  * [scripts/kernel/run/invocation-resolver.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/run/invocation-resolver.mjs): ambiguous/stale 시 신규 Run 발급 경로 추가.
  * [scripts/kernel/run/run-locator.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/run/run-locator.mjs): stale locator 자동 정리 로직.
* **테스트**: `tests/kernel-run-locator-fail-soft.test.mjs`

### Wave 4 — Execution → PROVE Final Reconciliation & Subagent Review
* **목표**: 검증 바인딩과 리뷰어 바인딩을 PROVE 시점으로 이동하고, 동적 Catalog Refresh 및 Subagent Review 지원.
* **수정 대상**:
  * [scripts/kernel/control-plane.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/control-plane.mjs): PROVE 진입 시 `discoverProjectCommands` 재호출 및 obligations 동적 갱신.
  * [scripts/kernel/proof/review-pipeline.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/proof/review-pipeline.mjs): external transport 부재 시 `action: { type: 'review', mode: 'subagent' }` 발행.
  * [scripts/kernel/proof/review-receipt.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/proof/review-receipt.mjs): subagent actorSessionId 정규화 헬퍼 추가.
* **테스트**: `tests/kernel-final-reconciliation.test.mjs`, `tests/kernel-subagent-review.test.mjs`

### Wave 5 — Concurrent Knowledge Lifecycle & Decoupled Git Closeout
* **목표**: 복수 Run의 지식 커밋 충돌 시 최대 3회 CAS 재시도, 실패 시 `deferred` 상태 보존 및 코드의 Git Closeout 정상 완료.
* **수정 대상**:
  * [scripts/kernel/knowledge/commit.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/knowledge/commit.mjs): CAS retry 루프(최대 3회), duplicate/supersession 재평가.
  * [scripts/kernel/run/finalization.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/run/finalization.mjs): `knowledgeStatus === 'deferred'` 시에도 `gitCloseout` 허용.
* **테스트**: `tests/kernel-concurrent-commit.test.mjs`, `tests/kernel-finalization-knowledge-nonblocking.test.mjs`

### Wave 6 — Worktree Concurrency & Mutation Boundary
* **목표**: 동일 작업트리 Writer 충돌 시 세션 종료 없이 Read-Only/Analysis 모드로 전환하여 세션 생존 보장.
* **수정 대상**:
  * [scripts/kernel/run/worktree-binding.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/run/worktree-binding.mjs)
  * [scripts/kernel/run/invocation-resolver.mjs](file:///c:/dev/moonshot-relay/scripts/kernel/run/invocation-resolver.mjs): lease 충돌 시 세션 에러 대신 read-only 안내 반환.
* **테스트**: `tests/kernel-worktree-concurrency-downgrade.test.mjs`

### Wave 7 — Cross-Provider Matrix & E2E Verification
* **목표**: 6대 표면(Codex App/CLI, Claude App/CLI, Antigravity, Qwen Code)에서 전체 E2E 시나리오 검증.
* **테스트**: `tests/kernel-cross-surface-matrix.test.mjs`

---

## 4. PR 패키징 계획

| PR 번호 | 명칭 | 포함 내용 |
| :--- | :--- | :--- |
| **PR 1** | **Execution-First Admission** | Wave 0(Baseline), Wave 1(Slim Preflight), Wave 2(Fail-Soft Context), SKILL.md 지침 개정 |
| **PR 2** | **Locator & Session Fail-Soft** | Wave 3(Locator stale/ambiguous 시 New Run 발급, CLI 선행 throw 제거) |
| **PR 3** | **Final Reconciliation & Subagent Review** | Wave 4(PROVE 시점 Catalog Refresh, Canonical Execution 유지, Subagent Review 연동) |
| **PR 4** | **Concurrent Knowledge & Git Closeout** | Wave 5(Knowledge CAS 3회 재시도, Deferred 지식 보존, Git Closeout 의존성 분리) |
| **PR 5** | **Worktree Concurrency** | Wave 6(동일 작업트리 충돌 시 Read-Only 생존 및 워크트리 안내) |
| **PR 6** | **Provider Matrix E2E** | Wave 7(6대 표면 E2E 검증, 통합 회귀 테스트) |

---

## 5. 사용자 가시 SKILL.md 지침 개정안

```markdown
Perform the user's requested work in the current native owner surface as soon
as a safe project/workspace scope is known.

Harness lifecycle, reviewer, verification, locator, or knowledge-finalization
issues that are not direct safety boundaries must not prevent ordinary
implementation. Preserve the work and resolve those obligations during PROVE
or finalization.

When an independent reviewer is required and no external reviewer transport
is available, perform the review using an independent, read-only subagent session
and report the structured judgment review receipt.

Do not select an uncertain Run merely to make the lifecycle appear complete;
when ambiguous, a fresh Run is issued to cleanly track baseline and mutations.

Kernel completion remains evidence-based; implementation progress and Kernel
final acceptance are separate.
```

---

## 6. 검증 계획 (Verification Plan)

### Automated Tests
1. **회귀 방지 테스트 실행**:
   ```bash
   npm test
   ```
2. **각 Wave별 신규 테스트 검증**:
   ```bash
   node --test tests/kernel-execution-first-baseline.test.mjs
   node --test tests/kernel-preflight-execution-first.test.mjs
   node --test tests/kernel-context-bootstrap-degraded.test.mjs
   node --test tests/kernel-run-locator-fail-soft.test.mjs
   node --test tests/kernel-final-reconciliation.test.mjs
   node --test tests/kernel-subagent-review.test.mjs
   node --test tests/kernel-concurrent-commit.test.mjs
   node --test tests/kernel-finalization-knowledge-nonblocking.test.mjs
   node --test tests/kernel-worktree-concurrency-downgrade.test.mjs
   node --test tests/kernel-cross-surface-matrix.test.mjs
   ```

### Manual Verification
1. **Codex / Antigravity / Claude 환경에서 명령 미선언 상태로 구현 진입 확인**:
   - `package.json`에 없는 가상의 verification requirement를 가진 contract로 `kernel next` 호출 시 즉시 `implement` 액션 반환 확인.
2. **독립 리뷰어 부재 시 Subagent Review Action 발행 확인**:
   - T3 작업 완료 후 `kernel report` 시 `action: { type: 'review', mode: 'subagent' }` 발행 및 서브에이전트 영수증 채택 확인.
3. **지식 CAS 충돌 시 Git 커밋 완료 확인**:
   - 두 세션에서 동시 지식 커밋 유발 후 한 세션이 `deferred` 상태가 되어도 Git Closeout이 정상 완료되는지 확인.
