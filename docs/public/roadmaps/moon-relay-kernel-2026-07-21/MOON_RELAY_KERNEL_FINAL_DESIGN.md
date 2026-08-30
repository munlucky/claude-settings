# Moon Relay Kernel 최종 설계

> **Current implementation addendum (2026-08-30):** This document preserves
> the original architecture decisions for roadmap provenance. The current
> implementation supersedes its Wave lifecycle sections: the Step Ledger is
> the only planning authority, parallel selection is derived, Host dispatch is
> transient, and no persistent batch, group, parallel-plan, or integration
> lifecycle exists. The model-visible surface remains `next` and `report`.

Date: 2026-07-21  
Version: 1.0  
Target branch: `kernel/moon-relay-kernel`  
Product ID: `moon-relay-kernel`

## 1. 문서 목적

이 문서는 Moonshot Relay를 단순 축소하거나 이름만 바꾸는 계획이 아니다. 기존 Relay가 확보한 다음 저수준 자산은 재사용한다.

- 프로젝트 식별과 계정 루트 상태 경로
- 관리형 Node 런타임과 폐쇄망 설치 기반
- SQLite runtime-state, lease, 재개, 완료 권한
- 샌드박스와 승인 경계
- 검증·브라우저·리뷰·패키지 어댑터
- project knowledge namespace, provenance, redaction
- worktree와 harness lab

반면 다음 상위 계층은 새 제품 계약으로 다시 구현한다.

- 공개 진입점과 스킬 카탈로그
- 작업 분류와 워크플로우 상태 머신
- 단계별 컨텍스트 컴파일
- 최소 구현 규율
- 위험 기반 리뷰와 증거 생성
- 외부 스킬 관리
- Relay/Kernel 동시 설치 및 Codex 앱 분리

Moon Relay Kernel의 핵심 정의는 다음과 같다.

> 모델을 더 많은 자연어 규칙으로 통제하지 않고, 필요한 정보만 제공하며, 허용 범위와 완료 조건을 코드와 증거로 강제하는 적응형 코딩 하네스.

---

## 2. 문제 정의

현재 Relay는 추적성·검증·장기 작업 복구 측면에서 강력하지만 다음 비용이 있다.

1. 제품·아키텍처·구현·phase 실행 등 공개 진입점이 많다.
2. 작은 변경도 정식 문서·계획 체인으로 확대될 수 있다.
3. 동일한 hard stop과 정책 설명이 여러 스킬에 반복된다.
4. 컨텍스트 팩이 단계별로 정제되어도 상위 워크플로우가 여전히 무겁다.
5. 외부 방법론을 도입할 때 기존 owner에 흡수되어 실험 속도가 느리다.
6. Codex 앱과 계정 루트 설치에서 서로 다른 하네스의 스킬과 상태가 섞일 수 있다.

Kernel은 Relay의 안정성 자산을 버리지 않으면서 이 비용을 줄여야 한다.

---

## 3. 목표와 비목표

### 3.1 목표

- Relay와 Kernel을 같은 계정에 동시에 설치하고 독립적으로 실행한다.
- 기본 공개 진입점은 `moon-relay-kernel` 하나로 제한한다.
- 작업 크기·위험·불확실성에 따라 워크플로우와 리뷰 깊이를 조절한다.
- 항상 로드하는 프롬프트를 작게 유지하고, 단계별 관련 정보만 컴파일한다.
- 목표·설계·슬라이스는 사람이 읽는 파일로, 실행 사실과 완료 권한은 SQLite로 관리한다.
- 작은 작업에는 작은 증거, 장기·고위험 작업에는 릴리스 수준 증거를 생성한다.
- Ponytail, Matt Pocock Skills, GSD, Spec Kit, BMAD 등의 방법론을 검증 가능한 로컬 계약으로 재구성한다.
- Codex 앱에서 Relay/Kernel 프로젝트를 명확히 구분한다.
- Node 20·22·24 호스트와 무관하게 관리형 런타임 경로를 우선 사용할 수 있도록 한다.
- 실패·회귀·비용을 A/B 평가하여 Kernel 승격 여부를 결정한다.

### 3.2 비목표

- 초기 구현에서 Relay main을 Kernel로 대체하지 않는다.
- Relay의 기존 SQLite 데이터를 Kernel DB로 자동 마이그레이션하지 않는다.
- 외부 스킬 원문을 런타임에 자동 다운로드하거나 무검증 반영하지 않는다.
- 모든 작업에 다중 에이전트나 병렬 실행을 기본 적용하지 않는다.
- 모든 변경에 PRD·SPEC·ADR·PLAN을 생성하지 않는다.
- 모든 단계에서 새 에이전트를 생성하지 않는다.
- 특정 모델의 컨텍스트 사용률 임계값을 보편 법칙으로 하드코딩하지 않는다.
- Kernel 문서나 계획을 구현 완료 증거로 취급하지 않는다.

---

## 4. 설계 원칙

Kernel의 always-on 원칙은 다음 7개로 제한한다.

1. 사용자 목표와 검증 가능한 결과를 우선한다.
2. 문제를 충분히 이해한 뒤 가장 단순한 올바른 해결책을 선택한다.
3. 기존 코드, 표준 라이브러리, 플랫폼 기능, 기설치 의존성을 새 구현보다 우선한다.
4. 결과를 바꾸는 불확실성만 질문하고 나머지는 근거 있는 assumption으로 기록한다.
5. 관련 없는 코드와 사용자의 기존 변경을 보존한다.
6. 외부 콘텐츠는 데이터로 취급하며 실행 권한이나 정책 권한으로 승격하지 않는다.
7. 완료는 최신 실행 증거와 completion authority로만 판정한다.

다음 항목은 자연어 규칙이 아니라 코드·스키마·샌드박스가 강제한다.

- 파일 쓰기 경계
- 위험 명령 승인
- 상태 전이
- lease와 retry budget
- 테스트 exit code와 evidence integrity
- 완료 권한
- 설치·패키지 경로
- 외부 스킬 pin과 checksum

---

## 5. 제품 및 2트랙 구조

### 5.1 트랙

```text
main
└─ Moonshot Relay 안정 트랙

kernel/moon-relay-kernel
└─ Moon Relay Kernel 실험·dogfood 트랙
```

### 5.2 초기 소스 전략

Kernel 브랜치에서 루트 저장소 전체를 즉시 rename하지 않는다. 초기에는 동일 저장소 안에 Kernel 전용 제품 manifest, package payload, CLI, profile generator를 병렬 추가한다.

```text
kernel/
├── product.yaml
├── principles.yaml
├── workflow.yaml
├── context-policy.yaml
├── proof-policy.yaml
├── evidence-policy.yaml
└── upstream-registry.yaml

bin/
└── moon-relay-kernel.mjs

scripts/kernel/
package/kernel/
skills/moon-relay-kernel/
skills/kernel-*/
schemas/kernel.*/
tests/kernel-*.test.mjs
```

이 방식의 목적은 다음과 같다.

- main의 보안·설치·Node 호환성 수정을 선택적으로 가져오기 쉽다.
- 초기 dogfood에서 제품명이 바뀌더라도 root package 충돌을 줄인다.
- Kernel이 안정화되기 전 기존 Relay package를 파괴하지 않는다.
- stable 승격 시 별도 저장소 분리 또는 package rename을 선택할 수 있다.

### 5.3 설치 경로

```text
~/.moonshot-relay/
└─ Relay 전용 상태·프로필·런타임

~/.moon-relay-kernel/
└─ Kernel 전용 상태·프로필·런타임
```

공유 금지 대상:

- runtime-state DB
- run/goal/lease namespace
- completion 상태
- cache와 logs
- knowledge revision
- installed profile manifest
- skill lockfile
- package materialization root

공유 가능한 대상:

- 검증된 source utility
- managed Node runtime materialization 코드
- project identity resolver
- sandbox primitives
- read-only test fixtures

공유는 source-level reuse일 뿐 runtime directory 공유가 아니다.

---

## 6. 프로젝트 트랙 선택

트랙 binding은 저장소가 아니라 계정 루트의 Kernel runtime home에 기록한다.

```text
~/.moon-relay-kernel/state/track-scopes/<scope-key>.json
```

`scope-key`는 canonical project root와 Git common/worktree directory를 함께 해시한 값이다. 따라서 같은 프로젝트의 서로 다른 worktree와 서로 다른 저장소가 하나의 track entry를 공유하지 않는다. 저장소의 `.moon-relay/track.yaml`은 이전 버전과의 호환을 위한 legacy boundary로만 읽는다.

판정 우선순위:

1. 저장소의 legacy `.moon-relay/track.yaml`
2. 현재 project/worktree의 account-root scope binding
3. 명시적 process track (`MOON_RELAY_TRACK`)
4. 설치된 Kernel runtime marker를 통한 account-root bootstrap candidate

Kernel 스킬은 활성 트랙이 Kernel이 아니면 실행을 거부한다.

```json
{
  "status": "wrong_harness",
  "requestedTrack": "kernel",
  "activeTrack": "relay",
  "relaunchHint": "open the Kernel project/worktree"
}
```

세션 중에 Relay에서 Kernel로 조용히 전환하지 않는다. 시스템 지침, 스킬 메타데이터, 훅, 상태 authority가 이미 섞였을 수 있기 때문이다.

---

## 7. Codex 앱 분리 설계

Codex 앱에서는 CLI 프로필 인자보다 프로젝트·작업공간 선택을 하네스 선택 경계로 사용한다.

```text
Codex App
├─ Project: my-project [Relay]
│  └─ /worktrees/my-project-relay
└─ Project: my-project [Kernel]
   └─ /worktrees/my-project-kernel
```

각 worktree에는 해당 트랙만 보인다.

### Relay worktree

```text
.codex/config.toml           Relay profile config
.codex/hooks.json            Relay hooks
.agents/skills/              Relay public skills only
AGENTS.override.md           Relay activation contract
```

### Kernel worktree

```text
.codex/config.toml           Kernel profile config
.codex/hooks.json            Kernel hooks
.agents/skills/              moon-relay-kernel + allowed utilities
AGENTS.override.md           Kernel activation contract
```

전역 `~/.agents/skills`에 Relay와 Kernel의 전체 스킬을 함께 노출하지 않는다. 원본 스킬은 각 runtime home에 보관하고 프로젝트 `.agents/skills`에는 해당 트랙만 symlink 또는 materialize한다. Track authority 자체는 `state/track-scopes`에 두며 저장소 파일을 만들지 않는다.

Codex 앱이 자체 worktree를 생성하는 기능은 초기 dogfood에서 사용하지 않는다. 먼저 하네스가 준비한 Relay/Kernel base worktree를 앱 프로젝트로 등록한다. 이후 hydration hook의 재현성이 검증되면 앱 생성 worktree 지원을 추가한다.

---

## 8. 논리 아키텍처

```text
User Request
    ↓
Moon Relay Kernel Entrypoint
    ↓
Intent Router
    ├─ task class
    ├─ ambiguity
    ├─ risk tier
    └─ required capabilities
    ↓
Workflow Kernel
FRAME → SHAPE → SLICE → SCHEDULE → EXECUTE → PROVE → CLOSE
    ↓                    ↓                  ↓
Context Compiler      Task DAG          Proof Pipeline
    ↓                    ↓                  ↓
Repository Knowledge  Sequential/Derived Parallel Selection Evidence Authority
    ↘                    ↓                  ↙
          Runtime State + Sandbox
                     ↓
           Claude / Codex / Qwen adapters
```

### 핵심 컴포넌트

| 컴포넌트 | 책임 |
|---|---|
| Entrypoint | 목표 정규화, 트랙 검증, capability 라우팅 |
| Workflow Kernel | 상태 전이, skip 조건, retry/replan |
| Context Compiler | 단계별 관련 정보 선택, redaction, budget, receipt |
| Task Contract | objective, acceptance, scope, non-goals, risk, permissions |
| Step Ledger projection | dependency, predicted write-set, executable frontier |
| Step selection | 기본 순차 실행, disjoint Step만 transient Host dispatch |
| State Authority | run, lease, attempt, transition, completion |
| Projection Writer | DB 상태를 읽기 쉬운 파일로 단방향 투영 |
| Proof Pipeline | risk tier에 맞는 테스트·리뷰·UAT 선택 |
| Evidence Packager | E0/E1/E2 증거 패키지 생성 |
| Skill Registry | internal capability와 upstream pin 관리 |
| Profile Builder | Claude/Codex/Qwen별 격리된 설치 표면 생성 |

---

## 9. 적응형 워크플로우

### 9.1 상태

```text
FRAME
  ↓
SHAPE       비자명하거나 되돌리기 어려운 결정이 있을 때
  ↓
SLICE       복합 작업일 때
  ↓
SCHEDULE    task DAG가 있을 때
  ↓
EXECUTE
  ↓
PROVE
  ↓
CLOSE
```

### 9.2 빠른 경로

```text
읽기 전용 분석: FRAME → SHAPE → CLOSE
단순 기계 수정: FRAME → EXECUTE → PROVE(T0) → CLOSE
일반 버그: FRAME → EXECUTE → PROVE(T1/T2) → CLOSE
일반 기능: FRAME → SHAPE → SLICE → EXECUTE → PROVE → CLOSE
대형 변경: FRAME → SHAPE → SLICE → SCHEDULE → EXECUTE/PROVE 반복 → CLOSE
```

### 9.3 FRAME

Task Contract 최소 필드:

```yaml
objective: ""
acceptance: []
scope: []
nonGoals: []
knownFacts: []
assumptions: []
blockedDecisions: []
riskHints: []
allowedOperations: []
requiredEvidence: []
```

질문 조건:

- 선택에 따라 사용자 행동이 달라짐
- 데이터 구조·보안 경계·외부 계약이 달라짐
- 되돌리기 어려운 결정
- 여러 해석이 acceptance를 바꿈

그 외에는 코드베이스 관례와 보수적 기본값을 사용하고 assumption을 기록한다.

### 9.4 SHAPE

다음만 확정한다.

- 현재 구조와 변경 seam
- 선택지와 trade-off
- 권장 접근
- rollback
- verification seam
- 문서/ADR 필요 여부

ADR은 다음 조건이 모두 맞을 때만 생성한다.

1. 되돌리기 비용이 큼
2. 배경 없이는 선택이 놀라움
3. 실제 대안과 trade-off가 존재함

### 9.5 SLICE

슬라이스는 계층별 작업이 아니라 좁고 완결된 수직 경로다.

```yaml
id: KRN-SLICE-001
objective: ""
requirementIds: []
scenarioIds: []
blockedBy: []
acceptance: []
predictedWriteSet: []
sharedSurfaces: []
verification:
  local: []
  afterMerge: []
```

각 슬라이스는 fresh context 하나에서 처리할 수 있어야 하고 독립적으로 검증 가능해야 한다.

### 9.6 SCHEDULE

기본은 순차 실행이다.

같은 transient Step projection에 선택되기 위한 조건:

- dependency 없음
- predicted write-set 겹침 없음
- 같은 schema/migration/public interface/fixture 수정 없음
- 서로의 설계 전제를 바꾸지 않음
- 개별 검증과 병합 후 검증이 모두 정의됨

Host worker 수는 admission capability가 허용하는 범위로 제한하며, 결과는
기존 Step attempt와 execution receipt에 귀속한다.

### 9.7 EXECUTE

기본 순서:

1. 변경 흐름과 caller 탐색
2. 기존 구현·stdlib·native·기설치 dependency 확인
3. 가장 높은 practical public seam 선택
4. 실패 재현 또는 red test
5. 최소 구현
6. green verification
7. 필요할 때만 refactor
8. evidence와 projection 갱신

### 9.8 PROVE

Risk-Adaptive Proof Pipeline을 사용한다.

### 9.9 CLOSE

- fresh verification 실행
- acceptance별 evidence 연결
- runtime-state completion decision
- E0/E1/E2 Evidence Pack 생성
- 미완료·waiver·rollback 기록
- knowledge/skill improvement candidate 추출

---

## 10. 최소 구현 규율

Kernel의 `minimal-correct-change`는 Ponytail의 핵심 메커니즘을 로컬 계약으로 재구성한다.

```text
1. 실제로 필요한가?
2. 코드베이스에 이미 있는가?
3. 표준 라이브러리로 가능한가?
4. 플랫폼 네이티브 기능으로 가능한가?
5. 기설치 의존성으로 가능한가?
6. 더 높은 공통 seam 한 곳에서 고칠 수 있는가?
7. 그다음에만 최소 코드를 추가한다.
```

최소화 금지 대상:

- trust boundary validation
- 데이터 손실 방지
- 보안
- 접근성 기본
- 사용자가 명시적으로 요청한 범위
- 비자명한 로직의 실행 가능한 검증

`minimal-correct-change`는 output style을 짧게 만드는 스킬이 아니라 구현 선택을 줄이는 스킬이다.

---

## 11. 컨텍스트 컴파일러

### 11.1 5개 계층

```text
Layer 1 Stable Principles
Layer 2 Task Contract
Layer 3 Stage Context
Layer 4 On-demand References
Layer 5 Evidence Digest
```

### 11.2 단계별 입력

| 단계 | 포함 정보 |
|---|---|
| FRAME | 요청, glossary, 관련 정책, project identity |
| SHAPE | 관련 코드맵, ADR, architecture boundaries |
| SLICE | acceptance, dependency, write-set, test seam |
| SCHEDULE | DAG, ownership, isolation, worker budget |
| EXECUTE | 해당 slice, 변경 파일, local evidence |
| PROVE | diff, acceptance, risk tier, required checks |
| CLOSE | evidence digest, waivers, completion signals |

### 11.3 기본적으로 제외

- 전체 대화 기록
- 전체 로그
- 전체 KG/MemoryGraph/ontology
- 전체 ADR/PRD/SPEC
- 모든 스킬 본문
- 관련 없는 코드맵
- 정적 예시 묶음

### 11.4 참조 형태

```text
doc://architecture/auth
adr://0012-session-storage
code://symbol/AuthService.login
evidence://test/run-18
state://run/current
```

### 11.5 Context Receipt

```json
{
  "packId": "ctx-82f4",
  "stage": "execute",
  "tokenEstimate": 1140,
  "included": ["task-contract", "adr://0012", "code://AuthService.login"],
  "omitted": [{"source": "runtime-log", "reason": "raw_log_forbidden"}],
  "modelProfile": "codex-current"
}
```

Fresh Context는 작업 경계·리뷰 독립성·오염 신호·budget 초과에서만 사용한다. 50% 또는 70% 같은 고정 비율을 정책 상수로 사용하지 않는다.

---

## 12. 상태 권한 분리

### 12.1 파일이 소유하는 상태

- Task Contract
- CONTEXT.md glossary
- ADR
- Slice manifest와 DAG 정의
- 사람이 승인한 waiver
- 계획과 handoff

### 12.2 SQLite가 소유하는 상태

- run/goal ID
- lease와 active executor
- attempt/retry
- 상태 전이
- verification receipt
- evidence lineage
- completion authority

### 12.3 단방향 projection

```text
SQLite runtime state
    ↓
STATE.md / run-status.json / QA_REPORT.json
```

projection은 읽기 전용 파생물이다. 수동 수정으로 DB를 역갱신하지 않는다. 생성 시 runtime revision과 hash를 기록한다.

### 12.4 기존 Relay DB 처리

Kernel v1은 Relay DB를 자동 마이그레이션하지 않는다.

허용 가능한 별도 import:

- project identity mapping
- 사람이 승인한 durable knowledge
- source ADR/glossary
- 검증된 non-secret summary

금지:

- run/lease/attempt/completion 상태 복사
- Relay와 Kernel의 동일 DB 파일 사용
- raw logs/transcripts/secret-like data 이동

---

## 13. Risk-Adaptive Proof Pipeline

### Tier 0: deterministic only

대상:

- 문서 오타
- 포맷
- 행동 변화 없는 rename
- 생성물 동기화

검증:

- format/lint/schema/build 등 결정론적 검사

### Tier 1: compact review

대상:

- 작은 로컬 로직
- 기존 패턴을 따르는 CSS/설정
- 충분한 회귀 테스트가 있는 변경

검증:

- targeted tests
- 단일 reviewer가 spec, standards, 명백한 complexity를 함께 검토

### Tier 2: independent dual review

대상:

- 사용자 행동 변화
- 여러 파일·계층 수정
- root-cause bug fix
- 중간 blast radius

검증:

- Spec reviewer
- Standards + Complexity reviewer
- fresh integration checks

### Tier 3: full proof

대상:

- 인증·권한·결제·개인정보
- schema/migration
- 공개 API
- 신규 dependency
- 설치·패키지·프로필
- runtime-state/completion authority
- 대규모 refactor

검증:

- Spec
- Standards
- Complexity
- Security 조건부
- Browser/UAT 조건부
- Architecture 조건부
- 인간 승인: 비가역 데이터, 외부 계약, 보안 정책, acceptance 변경에 한함

Risk tier는 LOC 하나로 정하지 않는다.

```text
securityBoundary
dataImpact
publicContract
schemaChange
newDependency
userVisibleBehavior
blastRadius
reversibility
testCoverage
implementationNovelty
```

---

## 14. 조건부 Evidence Pack

### E0 단순 작업

```text
RUN_SUMMARY.json
```

### E1 일반 행동 변경

```text
TASK_CONTRACT.yaml
QA_REPORT.json
RUN_SUMMARY.json
```

### E2 장기·다중 슬라이스·고위험

```text
TASK_CONTRACT.yaml
SLICE_GRAPH.json
SPRINT_CONTRACT.md
QA_REPORT.json
RELEASE_EVIDENCE.json
HANDOFF.md   중단·전환 시
```

`RELEASE_EVIDENCE.json`은 requirement → slice → evidence → completion decision을 연결한다.

문서 양을 줄이되 추적성을 제거하지 않는다.

---

## 15. 스킬 아키텍처

### 15.1 공개 스킬

```text
moon-relay-kernel
```

선택적 운영 유틸리티:

```text
kernel-doctor
kernel-status
kernel-explain
```

### 15.2 내부 capability

P0:

- `kernel-frame-intent`
- `kernel-minimal-correct-change`
- `kernel-domain-modeling`
- `kernel-tracer-slicing`
- `kernel-tdd`
- `kernel-diagnosing-bugs`
- `kernel-verification-before-completion`

P1:

- `kernel-codebase-design`
- `kernel-review-spec`
- `kernel-review-standards`
- `kernel-review-complexity`
- 별도의 scheduler lifecycle이나 public execution skill은 추가하지 않는다.

P2:

- `kernel-skill-tdd`
- `kernel-doc-gardener`
- `kernel-architecture-garbage-collector`
- `kernel-upstream-check`

사용자 호출 스킬은 오케스트레이션만 담당하고, 모델 호출 스킬은 재사용 가능한 규율을 담당한다. 한 user-invoked skill이 다른 user-invoked skill을 연쇄 호출하는 구조는 피한다.

---

## 16. 외부 스킬 관리

외부 스킬 도입 모드:

```text
derived    핵심 패턴을 Kernel 계약으로 재작성
wrapped    원본을 얇은 adapter로 감쌈
subscribed 개인 실험용 플러그인으로 직접 사용
```

Kernel 핵심 스킬은 `derived`를 사용한다.

Registry 예시:

```yaml
id: minimal-correct-change
source:
  repository: DietrichGebert/ponytail
  pinnedCommit: "<sha>"
  license: MIT
adoptionMode: derived
adoptedPatterns:
  - minimality-ladder
  - root-cause-shared-seam
  - safety-exclusions
evalSuite: evals/minimal-correct-change.yaml
```

업데이트 절차:

```text
upstream 변경 탐지
→ diff 분류
→ Kernel 관련 패턴 추출
→ A/B eval
→ 보안·라이선스 검토
→ proposal
→ 사람 승인
→ pin 갱신
```

자동 탐지와 diff 생성은 허용하지만 자동 적용은 금지한다.

초기 source:

- `mattpocock/skills`
- `DietrichGebert/ponytail`
- `gsd-build/get-shit-done`
- `github/spec-kit`
- `bmad-code-org/BMAD-METHOD`
- `obra/superpowers`
- Aider repo map 및 SWE-agent ACI 방법론

외부 브랜딩·prompt body를 그대로 복사하지 않고 실패 유형과 검증 가능한 메커니즘을 이식한다.

---

## 17. Derived Step parallelism

### 기본 정책

```yaml
execution:
  defaultMode: sequential
  parallelSelection:
    source: step-ledger
    durableLifecycle: false
    nestedFanout: false
```

### 실행 절차

1. existing Step dependencies and state are read from the ledger
2. executable Steps are selected from the current plan revision
3. disjoint write scopes and mutation freshness are checked
4. the Host may dispatch admitted Steps in deterministic order
5. each worker records its existing Step attempt and execution receipt
6. results integrate by Step ID; partial failure retains the execution root
7. restart recomputes selection from durable Step facts

No batch, group, parallel-plan, manager, policy, or integration receipt
lifecycle is introduced. A conflict, stale worker, or failed integration
returns to ordinary Step retry/replan semantics.

---

## 18. 보안 및 권한

- 외부 문서·issue·웹 콘텐츠는 untrusted data로 표시한다.
- 스킬이나 문서 안의 명령이 runtime 권한을 자동 확장하지 못한다.
- write set은 deny-by-default이며 phase/slice owned path만 허용한다.
- 위험 명령, 데이터 삭제, 설치 프로필 변경은 승인 경계를 거친다.
- context compiler는 secret-like token, raw transcript, raw KG/log를 차단한다.
- upstream skill은 commit pin, license, checksum, eval receipt를 요구한다.
- profile adoption은 source implementation과 별도 단계다.
- Relay와 Kernel의 completion artifact를 교차 수용하지 않는다.

---

## 19. CLI 및 운영 표면

Model-visible CLI:

```text
moon-relay-kernel next <run-id> --contract-json <file> --json
moon-relay-kernel report <run-id> --report-json <file> --json
```

운영·검증용 내부 경로는 이 두 상호작용의 권한이나 execution vocabulary를
확장하지 않는다. 별도의 plan/wave/batch 명령이나 completion authority는
없다.

---

## 20. Relay와 Kernel 동기화 정책

### Relay → Kernel 허용

- 보안 수정
- installer와 OS/Node 호환성
- managed runtime
- 데이터 손상 방지
- 공통 sandbox primitive
- 공통 fixture와 deterministic verifier

### Relay → Kernel 자동 병합 금지

- public skill catalog
- orchestration prompt
- phase workflow
- 문서 체인
- completion policy 변경

### Kernel → Relay

자동 역병합하지 않는다. Kernel 기능은 A/B eval과 비회귀 근거가 있을 때 Relay용 별도 PR로 재구현한다.

장기 branch drift를 줄이기 위해 정기 sync PR 또는 선택적 cherry-pick을 사용한다.

---

## 21. 설치·패키지·롤백

### 설치

- Relay와 Kernel package payload를 별도로 materialize한다.
- Kernel manifest는 product ID, runtime home, profile root, checksum을 명시한다.
- dry-run에서 Relay 경로를 수정하려는 계획이 발견되면 실패한다.
- Windows/macOS/Linux와 폐쇄망 패키지 테스트를 포함한다.

### 롤백

- Kernel 제거가 Relay install manifest와 profile을 수정하지 않는다.
- 프로젝트 track을 `relay`로 되돌리면 새 Relay 프로젝트 세션에서 복구한다.
- Kernel runtime DB는 백업 후 별도 보존하거나 명시적으로 삭제한다.
- 설치 프로필 rollback receipt를 남긴다.

---

## 22. 평가 및 승격 기준

### 기준선

최소 30개 대표 작업:

- 읽기·분석 5
- 단순 버그 5
- 일반 기능 5
- 리팩터링 5
- UI 변경 5
- 장기·다중 슬라이스 5

측정:

- 성공률
- false completion
- 사용자 개입
- retry/replan
- input/output token
- wall-clock time
- 변경 LOC와 파일 수
- 신규 dependency 수
- evidence coverage
- 설치·상태 오염

### Hard Gates

- false completion 0
- 보안 회귀 0
- Relay/Kernel 상태 교차 오염 0
- 설치 제거 시 상대 트랙 손상 0
- completion evidence 누락 0
- 지원 OS package/install 테스트 통과

### 목표

- static prompt/skill metadata 50% 이상 감소
- 대표 작업 성공률 Relay 대비 -5% 이내
- 장기 작업 성공률 Relay 이상
- 중간 산출물 40% 이상 감소
- 사용자 개입 증가 없음
- 불필요한 dependency 및 변경 LOC 감소
- context/evidence provenance 100%

### 승격

```text
experimental → dogfood → preview → stable candidate
```

stable candidate 이후 선택:

1. 동일 저장소의 별도 package로 유지
2. 별도 `moon-relay-kernel` 저장소로 분리
3. Relay 차세대 main으로 전환

결정은 dogfood evidence 이후에만 한다.

---

## 23. 핵심 위험과 대응

| 위험 | 대응 |
|---|---|
| Relay 코드 재사용이 Kernel 결합으로 변함 | adapter와 product boundary, runtime home 격리 |
| 파일/DB split brain | authority separation, one-way projection |
| risk tier 오분류 | conservative escalation, eval tuning, tier receipt |
| 병렬화 merge 실패 | sequential default, write-set conflict, maxWorkers=2 |
| 외부 스킬 노후화 | managed upstream registry와 정기 diff |
| 자동 업데이트 공급망 위험 | pin·checksum·eval·사람 승인 |
| Codex 앱 스킬 혼합 | 프로젝트별 `.agents/skills`와 worktree 분리 |
| 문서 축소로 추적성 상실 | conditional Evidence Pack |
| managed runtime package 증가 | 기존 runtime materialization 재사용, checksum test |
| 장기 branch drift | security-only sync policy와 정기 sync PR |

---

## 24. 완료 정의

Kernel v1은 다음이 모두 만족될 때만 완료다.

1. Relay와 Kernel이 같은 계정에 설치되고 상태·프로필·스킬이 교차 오염되지 않는다.
2. Kernel 프로젝트에서 단일 공개 진입점이 정상 라우팅된다.
3. 빠른 경로와 전체 경로의 상태 전이가 결정론적으로 검증된다.
4. context receipt가 포함·제외 근거와 provenance를 기록한다.
5. 파일 intent와 SQLite execution authority가 분리되고 projection 역갱신이 차단된다.
6. T0~T3 proof tier와 E0~E2 evidence tier가 시나리오별로 선택된다.
7. 외부 스킬 update가 자동 적용되지 않고 proposal로만 생성된다.
8. Step Ledger가 병렬 선택을 결정하고 Host dispatch가 transient receipt만 남기며, 충돌·실패는 기존 Step recovery로 돌아간다.
9. Codex 앱 Relay/Kernel 프로젝트가 각각 해당 스킬만 발견한다.
10. managed Node runtime, package, installer, uninstall, rollback 검증이 통과한다.
11. 30개 대표 작업 A/B 평가에서 hard gate를 모두 통과한다.
12. runtime-state의 accepted decision과 fresh evidence 없이 완료를 주장할 수 없다.

---

## 25. 참고 방법론

- OpenAI Harness Engineering: repository knowledge, progressive disclosure, mechanical invariants
- Matt Pocock Skills: user/model-invoked skill 분리, grilling, domain glossary, tracer tickets, spec/standards review
- Ponytail: minimality ladder, root-cause shared seam, safety exclusions
- GSD: thin orchestrator, fresh executor context, bounded slices, file-backed human visibility
- Spec Kit: spec/plan/tasks handoff, dependency and parallel markers, scale-sensitive workflow
- BMAD: scale-adaptive planning and risk-based testing
- Superpowers: TDD, systematic debugging, verification before completion, skill TDD
- Aider / SWE-agent / OpenHands: repo map, agent-computer interface, layered skills

이 문서는 외부 프로젝트의 전체 워크플로우나 prompt를 복사하는 근거가 아니다. 각 패턴은 Kernel의 실패 기준과 평가 세트를 통과한 뒤에만 채택한다.
