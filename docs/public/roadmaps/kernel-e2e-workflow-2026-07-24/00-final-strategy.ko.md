# Moonshot Relay Kernel E2E 개발 워크플로우 최종 개선 전략

**문서 상태:** Final / Implementation Baseline
**기준 브랜치:** `main`
**기준일:** 2026-07-24
**적용 범위:** GPT-5.6·Fable 기반 Kernel 모드
**대체 문서:** 기존 v1, v2, v3 전략 문서

---

# 1. 목적

Moonshot Relay Kernel을 다음 두 환경에서 개발 작업 전체를 E2E로 수행할 수 있는 개발 런타임으로 완성한다.

1. 빈 저장소 또는 초기 상태에서 새로운 프로젝트를 개발하는 경우
2. 기존 코드베이스에서 기능 추가, 버그 수정, 구조 변경, 마이그레이션을 수행하는 경우

Kernel은 기존 Relay의 축소판이 아니다.
Kernel의 목적은 GPT-5.6과 Fable 같은 최신 모델이 이미 수행할 수 있는 코드 탐색, 설계, 구현, 디버깅 능력을 장문의 프롬프트와 강제 방법론으로 방해하지 않으면서도 다음을 보장하는 것이다.

* 실행 상태의 지속성
* 중단 후 정확한 재개
* 검증 명령의 실제 실행
* 검증 증거와 소스 버전의 연결
* false completion 방지
* 검증된 프로젝트 지식의 재사용
* 선택적 Git closeout

최종 원칙은 다음 한 문장으로 정의한다.

> **모델은 개발 문제를 해결하고, Kernel은 실행 신뢰 경계와 완료 권위를 관리한다.**

---

# 2. 최종 제품 경험

사용자가 알아야 하는 공개 진입점은 하나다.

```text
moon-relay-kernel
```

사용자는 Kernel 공개 스킬에 개발 목표를 한 번 요청한다.

```text
이 프로젝트의 로그인 오류를 수정해줘.
```

Kernel 내부에서는 다음 E2E 루프가 수행된다.

```text
목표 이해
→ 관련 프로젝트 컨텍스트 탐색
→ 필요한 만큼만 설계·분해
→ 구현
→ 실제 검증
→ 실패 복구
→ 완료 판정
→ 지식 저장
→ 선택적 Git closeout
```

사용자는 다음을 선택하거나 직접 관리하지 않는다.

* Greenfield/Brownfield 모드
* FRAME·SHAPE·SLICE·SCHEDULE 단계
* proof tier
* execution cursor
* mutation revision
* knowledge revision
* reviewer 종류
* worktree 정책

이들은 모두 Kernel 내부 정책이다.

---

# 3. 복잡도에 대한 최종 정의

Kernel이 통제해야 하는 복잡도는 두 종류다.

## 3.1 허용 가능한 복잡도

모델에게 노출되지 않는 런타임 내부 복잡도다.

* SQLite 상태 저장
* execution cursor
* evidence lineage
* workspace identity
* mutation revision
* attempt와 lease
* knowledge freshness
* completion decision
* Git finalization receipt

이러한 기능은 신뢰성과 복구를 높이므로 허용한다.

## 3.2 허용하지 않는 복잡도

최신 모델이 직접 읽고 따라야 하는 복잡도다.

* 긴 Always-on 프롬프트
* 중복되는 다수의 스킬
* 역할별 장문 페르소나
* 모든 작업에 강제되는 설계·계획·리뷰
* 모델이 직접 관리하는 상태 머신
* 전체 Knowledge Graph 주입
* 기본 멀티에이전트
* 동일 요구사항의 반복 전달
* 코드보다 하네스 상태를 더 많이 생각하게 하는 구조

Kernel의 복잡도 최적화 목표는 모듈 수를 줄이는 것이 아니다.

> **모델이 한 작업에서 이해해야 하는 개념, 규칙, 단계의 수를 최소화하는 것이 핵심이다.**

---

# 4. 책임 분리

## 4.1 모델 책임

* 사용자 요구사항 이해
* 저장소와 코드 탐색
* 설계 판단
* 작업 분해
* 코드 구현
* 오류 원인 추적
* 변경 내용 검토
* 구조화된 judgment 제출

## 4.2 Kernel 런타임 책임

* 프로젝트 유형 판정
* Task Contract 저장
* 실행 상태와 cursor 관리
* workspace identity 관측
* 검증 명령 실제 실행
* hard evidence 수집
* evidence와 소스 버전 연결
* 완료 판정
* 지식 후보 검토·저장
* Git closeout

## 4.3 Host 책임

* GPT-5.6·Fable 모델 세션 생성
* 모델 turn 실행
* 모델과 Kernel runtime 사이의 tool call 중개

---

# 5. Host Integration Contract

## 5.1 핵심 규범

**Kernel 코어는 모델 provider API를 직접 호출하지 않는다.**

Kernel 패키지 안에 다음을 추가하지 않는다.

* OpenAI·Anthropic 등의 provider client
* API key 관리
* 모델별 대화 세션 구현
* 별도 agent orchestration SDK
* provider fallback router

현재 Kernel의 배포 표면도 CLI, 런타임, 정책, 스킬과 호스트 프로필 중심으로 구성돼 있다.

## 5.2 실행 계층

```text
사용자
  ↓
Codex / Claude / Fable Host
  ↓
moon-relay-kernel 공개 스킬
  ↓
Kernel coarse-grained runtime tool
  ↓
Kernel State / Proof / Knowledge
```

## 5.3 모델 가시 runtime command

모델에게 노출하는 Kernel 명령은 원칙적으로 두 개로 제한한다.

```text
kernel next <run-id>
kernel report <run-id> --json
```

### `kernel next`

반환 내용:

* 현재 objective
* acceptance
* 관련 코드·프로젝트 지식
* 현재 evidence
* 지금 수행해야 할 action

### `kernel report`

제출 내용:

* 변경 요약
* 변경 경로
* 발견된 위험
* 요청하는 검증
* structured judgment
* blocker

Kernel은 report를 받아 다음을 자동 처리한다.

```text
workspace identity 재관측
→ mutation 여부 판정
→ 검증 명령 실행
→ evidence 저장
→ 상태 전이
→ 완료 또는 다음 action 반환
```

## 5.4 금지 사항

* 모델에게 `start-run`, `transition`, `prove`, `finalize`를 직접 호출하게 함
* 모델이 FRAME·SHAPE 등의 상태를 직접 선택하게 함
* Kernel CLI가 독립 LLM 클라이언트로 성장함

현재 CLI는 저수준 상태 명령을 직접 노출하고 있으며, `prove` 역시 호출자가 결과를 전달하는 구조다. 최종 구현에서는 이 명령들을 내부·디버깅용으로 강등한다.

---

# 6. 공개 표면과 모델 가시 복잡도 예산

## 6.1 공개 표면

```text
공개 스킬: moon-relay-kernel 1개
모델 가시 runtime command: next, report 2개
사용자 개발 요청: 1회
```

현재 catalog도 공개 진입점을 `moon-relay-kernel` 하나로 제한하고 있다.

## 6.2 프롬프트 예산

```text
Always-on 원칙: 5~8개
SKILL.md 본문: 약 200~400 토큰
stable context: 최대 600 토큰
stage context: 최대 1,800 토큰
```

현재 context policy도 stable 600, stage 1,800 토큰을 기준으로 한다.

## 6.3 프로젝트 지식 예산

한 turn에 제공하는 지식:

```text
현재 objective
→ acceptance
→ 직접 관련된 코드
→ 관련 public contract
→ focused verification
→ 관련 프로젝트 지식 3~7건
→ 현재 실패 증거
```

금지:

* 전체 저장소 덤프
* 전체 Knowledge Graph
* 전체 runtime log
* 전체 과거 Run
* raw transcript

## 6.4 Capability 예산

```text
일반 작업: 0~1개
복잡 작업: 최대 2개
```

Capability는 해당 조건이 발생한 시점에만 짧게 활성화한다.

---

# 7. Kernel의 네 가지 핵심 Primitive

오픈소스 하네스의 참조 사상은 다음 네 가지 Kernel primitive로 압축한다.

## 7.1 Compact Task Contract

최소 구조:

```json
{
  "objective": "잘못된 비밀번호의 응답 코드를 수정한다",
  "acceptance": [
    "잘못된 비밀번호는 401을 반환한다",
    "잠긴 계정은 기존대로 423을 반환한다"
  ],
  "constraints": [
    "기존 public error schema를 유지한다"
  ],
  "nonGoals": [
    "로그인 API 전체 재설계"
  ]
}
```

위험이 있을 때만 확장한다.

```json
{
  "risk": {
    "publicContract": true,
    "securityBoundary": false,
    "dataMigration": false,
    "irreversibleDecision": false
  }
}
```

## 7.2 Durable Run State

SQLite를 authority로 사용한다.

* 현재 action
* 현재 slice
* 완료 slice
* active attempt
* last valid evidence
* next action
* contract revision
* mutation revision
* workspace identity
* blocked reason

Chat history는 resume authority가 아니다.

## 7.3 Relevant Project Context

모델에게 현재 작업에 직접 필요한 증거만 제공한다.

## 7.4 Evidence Gate

모델의 완료 서술이 아니라 Kernel이 직접 수집한 evidence와 structured judgment를 사용한다.

---

# 8. Acceptance와 Evidence Plan

각 acceptance에는 실행 전에 evidence plan이 있어야 한다.

```json
{
  "acceptance": "잠긴 계정은 423을 반환한다",
  "evidencePlan": {
    "class": "hard",
    "method": "integration-test",
    "commandRef": "test:auth"
  }
}
```

```json
{
  "acceptance": "기존 architecture boundary를 침범하지 않는다",
  "evidencePlan": {
    "class": "judgment",
    "method": "semantic-review"
  }
}
```

Evidence plan이 없는 acceptance만 실행을 차단한다.

예:

```text
"가독성을 높인다"
```

이 문장은 다음과 같이 바꿔야 한다.

```text
중복된 validation 분기를 하나의 기존 helper로 통합하고,
기존 public behavior와 테스트 결과를 유지한다.
```

내부적으로 V1·V2·V3와 같은 분류를 사용할 수 있으나 모델과 사용자에게 노출하지 않는다.

---

# 9. Obligation과 완료 규칙

## 9.1 Executable obligation

Hard evidence로 검증한다.

* unit test
* integration test
* build
* lint
* typecheck
* API scenario
* CLI smoke
* browser scenario
* migration smoke

## 9.2 Judgment obligation

Structured judgment로 검증한다.

* semantic compliance
* architecture fit
* backward compatibility 판단
* code quality
* UX quality
* documentation quality

## 9.3 완료 규칙

1. 소스를 변경한 Run은 최소 1건 이상의 Kernel runtime hard evidence가 필요하다.
2. 모든 executable obligation은 hard evidence로 충족해야 한다.
3. 모든 judgment obligation은 structured judgment로 충족해야 한다.
4. Judgment는 executable evidence를 대체할 수 없다.
5. Hard evidence는 judgment obligation을 자동 충족하지 않는다.

분석·문서 작업처럼 소스를 변경하지 않는 Run은 judgment evidence만으로 완료할 수 있다.

---

# 10. Workspace Identity

기존 단일 `sourceIdentity` 개념을 세 가지로 분리한다.

```json
{
  "runStartSourceIdentity": "sha256:...",
  "currentWorkspaceIdentity": "sha256:...",
  "verifiedSourceIdentity": "sha256:...",
  "mutationRevision": 4
}
```

## 10.1 Run Start Identity

Run 생성 당시의 workspace 상태다.

* 불변
* provenance 기준점
* 덮어쓰기 금지

현재 Kernel은 Run 시작 시 Git tree를 바탕으로 source identity를 계산하며 caller-authored identity를 거부한다.

## 10.2 Current Workspace Identity

Kernel이 가장 최근 관측한 workspace 상태다.

관측 시점:

* `report` 수신
* 검증 명령 실행 직전
* resume
* closeout 직전

## 10.3 Verified Source Identity

각 verification이 실제로 실행된 workspace 상태다.

## 10.4 Mutation Revision

상태 진입이 아니라 workspace identity가 실제로 변경됐을 때만 증가시킨다.

현재 구현은 `SHAPE` 또는 `EXECUTE` 진입 시 mutation revision을 증가시키므로 실제 소스 변경과 일치하지 않을 수 있다.

## 10.5 완료 정합성

```text
verification.verifiedSourceIdentity
==
run.currentWorkspaceIdentity
```

```text
verification.verifiedMutationRevision
==
run.mutationRevision
```

다르면 기존 evidence는 stale이다.

---

# 11. Proof Executor

## 11.1 현재 문제

현재 `prove`는 호출자가 전달한 다음 값을 저장한다.

* status
* command
* exit code
* digest

런타임이 명령을 실행하지 않는다.

완료 판정은 명령, exit code, digest, mutation revision, source identity의 형식 정합성을 검사하지만 그 값이 실제 실행으로 생성됐는지는 확인하지 못한다.

## 11.2 최종 원칙

Executable obligation은 반드시 Proof Executor가 직접 실행한다.

기록:

```json
{
  "obligationId": "auth-regression",
  "executor": "kernel-runtime",
  "command": "npm",
  "args": ["test", "--", "auth"],
  "cwd": "/project",
  "exitCode": 0,
  "stdoutDigest": "sha256:...",
  "stderrDigest": "sha256:...",
  "executedAt": "...",
  "verifiedSourceIdentity": "sha256:...",
  "verifiedMutationRevision": 4,
  "networkIsolation": "none"
}
```

## 11.3 P0 실행 범위

P0에서는 trusted command만 지원한다.

* package manifest에 등록된 script
* Kernel proof policy에 등록된 command mapping
* 이미 verified knowledge로 저장된 verification command

P0에서는 지원하지 않는다.

* 임의 shell command 자동 승인
* 외부에서 발견한 명령의 무조건 실행
* 자동 network sandbox
* 복잡한 container orchestration

## 11.4 실행 안전 정책

* command와 args 분리
* shell 사용 최소화
* 명시적 cwd
* timeout 필수
* 최소 환경변수
* secret-like 출력 redaction
* stdout/stderr 원문은 evidence storage에 격리
* prompt에는 digest와 필요한 오류 요약만 전달

## 11.5 네트워크 정책

```yaml
networkPolicy: inherited | blocked | required
```

### inherited

현재 실행 환경을 그대로 사용한다.

* P0 기본값
* `networkIsolation: none`으로 사실대로 기록

### blocked

실제 sandbox enforcement가 가능한 환경에서만 사용한다.

### required

네트워크 차단을 보장하지 못하면 Run을 blocked 처리한다.

차단하지 못하면서 `blocked`라고 기록하는 false security boundary를 금지한다.

---

# 12. Hard Evidence와 Structured Judgment

## 12.1 Hard Evidence

* Kernel runtime이 직접 실행
* exit code
* output digest
* 실행 시각
* workspace identity
* mutation revision
* obligation mapping

## 12.2 Structured Judgment

별도 컨텍스트와 고정 출력 계약을 사용한다.

```json
{
  "verdict": "pass",
  "acceptanceMapping": [
    {
      "acceptance": "기존 public response를 유지한다",
      "assessment": "변경된 코드와 API 테스트에서 포맷 변경이 발견되지 않음"
    }
  ],
  "regressionRisks": [],
  "evidenceClass": "judgment"
}
```

T2·T3 판단은 hard evidence의 대체물이 아니다.

---

# 13. Route와 상태 머신

내부 상태 머신은 7단계를 유지한다.

```text
FRAME
→ SHAPE
→ SLICE
→ SCHEDULE
→ EXECUTE
→ PROVE
→ CLOSE
```

현재 workflow도 이 7개 상태를 정의한다.

단, 모델에게 상태 이름을 노출하지 않는다.

## 13.1 기본 경로

```text
FRAME → EXECUTE → PROVE → CLOSE
```

## 13.2 SHAPE 삽입 조건

* public contract
* 인증·권한
* 데이터 저장 구조
* migration
* 외부 연동
* component boundary 변경
* 되돌리기 어려운 결정

## 13.3 SLICE 삽입 조건

* 한 번의 실행으로 안전하게 끝내기 어려움
* 여러 acceptance가 독립적으로 검증 가능
* 예상 변경 범위가 큼
* 실패 지점을 분리해야 함

## 13.4 SCHEDULE 삽입 조건

* 여러 세션에 걸친 실행
* dependency가 있는 여러 slice
* worktree 필요
* 제한적 병렬 실행 필요

현재 route는 T0이 아닌 일반 feature에 SHAPE를 기본 삽입하므로 조건부 구조로 변경해야 한다.

## 13.5 Route 승격

Run 도중 새로운 위험이 발견되면 경로를 확대할 수 있다.

```text
public contract 발견
→ SHAPE 삽입 + T2 이상

하위호환 파괴 발견
→ T3

변경 범위 급증
→ SLICE 삽입 검토

장기 작업 전환
→ SCHEDULE 활성화
```

한 Run 안에서 tier와 route는 승격만 허용한다.
강등이 필요하면 새 Run을 시작한다.

---

# 14. Proof Tier

## T0 Mechanical

* build
* lint
* typecheck
* 기본 test
* 산출물 존재

## T1 Scenario

* focused integration
* API scenario
* CLI 실제 실행
* 브라우저 smoke

## T2 Semantic

* 요구사항 의미 적합성
* architecture fit
* public contract compatibility
* cross-layer regression risk

## T3 Independent

* 별도 reviewer context
* 필요 시 다른 모델
* 고위험 독립 판단

## 14.1 Hard Floor

### T3

* security boundary
* 비가역 data migration
* runtime authority
* 파괴적 schema 변경
* 데이터 손실 가능성
* rollback 불가

### T2

* public contract
* 하위호환 schema 변경
* cross-layer behavior 변경

현재 정책은 public contract와 모든 schema change를 T3로 올리므로 조건부 복잡도 원칙에 맞게 경량화한다.

---

# 15. 신규 프로젝트 E2E 워크플로우

## 15.1 감지

다음 조건을 기반으로 Greenfield로 판정한다.

* 소스가 없거나 극소수
* build/test manifest 없음
* 기존 Kernel knowledge 없음
* README 또는 빈 Git 저장소만 존재

## 15.2 최소 Task Contract

```yaml
problem: ""
primaryOutcome: ""
acceptance: []
constraints: []
nonGoals: []
assumptions: []
```

질문은 결과를 실제로 바꾸는 모호성이 있을 때만 한다.

## 15.3 최소 설계

다음 조건에서만 설계를 확대한다.

* 여러 컴포넌트
* 데이터베이스
* 인증·권한
* 외부 API
* 비동기 처리
* 배포 환경
* 비가역 기술 선택

## 15.4 첫 Vertical Slice

신규 프로젝트의 첫 구현은 전체 scaffolding이 아니라 실행 가능한 최소 흐름이다.

```text
사용자 입력
→ application boundary
→ 핵심 비즈니스 동작
→ 저장 또는 최소 mock
→ 결과 반환
→ 실제 검증
```

## 15.5 구현

행동 변경에는 가능한 경우 RED-GREEN 흐름을 사용한다.

```text
실패 evidence 확보
→ 최소 구현
→ focused proof
→ 필요 시 refactor
```

## 15.6 완료

최소 조건:

* dependency resolution 성공
* build 성공
* 핵심 사용자 시나리오 성공
* acceptance evidence coverage 충족
* 실행 방법 확인

프로젝트별 추가 검증:

| 프로젝트   | 필수 증거                         |
| ------ | ----------------------------- |
| CLI    | 실제 명령 실행                      |
| API    | request/response contract     |
| 웹      | 브라우저 핵심 시나리오                  |
| 라이브러리  | public import와 사용             |
| 데이터 처리 | 입력→처리→출력                      |
| 배포 대상  | packaging 또는 deployment smoke |

---

# 16. 기존 프로젝트 E2E 워크플로우

## 16.1 감지

다음 중 일부가 있으면 Brownfield로 판정한다.

* 소스 코드
* package/build manifest
* 테스트
* CI
* Git history
* Project Knowledge

## 16.2 Repository Evidence Scan

현재 작업에 필요한 증거만 구성한다.

```json
{
  "entrypoints": [],
  "manifests": [],
  "buildCommands": [],
  "testCommands": [],
  "publicInterfaces": [],
  "criticalPaths": [],
  "dirtyPaths": [],
  "existingFailures": [],
  "relevantKnowledge": []
}
```

탐색 순서:

```text
manifest와 프로젝트 규칙
→ objective 관련 symbol/path
→ caller/callee
→ 관련 test seam
→ 필요한 파일만 context에 포함
```

## 16.3 Baseline Proof

변경 전 확보:

* focused test
* build
* lint/typecheck
* Git working tree
* 기존 실패

기존 실패 분류:

```json
{
  "taskBlockingFailures": [],
  "unrelatedFailures": [],
  "preExistingFailures": []
}
```

관련 없는 기존 실패 때문에 모든 작업을 중단하지 않는다.

## 16.4 영향 분석

전체 architecture 문서를 만들지 않고 변경 seam만 분석한다.

```json
{
  "changeSeam": "",
  "affectedCallers": [],
  "affectedContracts": [],
  "compatibilityRisks": [],
  "migrationRequired": false,
  "verificationSeams": [],
  "rollback": []
}
```

## 16.5 테스트 전략

```text
현재 동작 불명확
→ characterization test

버그 재현 가능
→ failing regression test

빌드·설정 문제
→ 재현 명령 또는 smoke check
```

그 후 기존 seam을 유지하는 최소 변경을 수행한다.

## 16.6 검증 순서

```text
focused test
→ 관련 contract/integration test
→ 영향 package test
→ build/typecheck/lint
→ 필요할 때만 full suite
→ 사용자 scenario 또는 smoke
```

---

# 17. Flaky Test 정책

Flaky obligation은 기본적으로 blocking이다.

1. 모든 실패를 자동 재실행하지 않는다.
2. flaky 의심이 있을 때만 동일 workspace identity에서 1회 재실행한다.
3. pass/fail이 갈리면 flaky 후보로 분류한다.
4. 명시적인 waiver 또는 quarantine 정책이 있어야 조건부 통과할 수 있다.
5. 통과 시 completion decision을 `degraded`로 기록한다.
6. 다음 항목은 waiver로 자동 완료할 수 없다.

* 인증
* 결제
* data migration
* 데이터 손실 방지
* 핵심 사용자 시나리오
* security regression

Baseline에서 이미 실패한 관련 없는 테스트는 flaky waiver가 아니라 pre-existing failure로 분리한다.

---

# 18. BLOCKED 규약

BLOCKED는 새로운 workflow 단계가 아니라 Run status다.

```text
reason:
- question
- permission
- external-dependency
- unsupported-verification
- unsafe-command
- network-policy
```

사용자 응답은 resume 시 Task Contract revision에 반영한다.
Acceptance가 바뀌면 기존 evidence를 자동 무효화한다.

---

# 19. Worktree 정책

기본값은 비활성화다.

활성화 조건:

* working tree가 dirty
* 여러 slice
* 장기 작업
* migration
* 대규모 변경
* 병렬 실행
* 자동 Git closeout

작은 단일 변경은 현재 workspace에서 수행할 수 있다.

---

# 20. 멀티에이전트 정책

기본 worker 수는 1이다.

```text
기본: 1
일반 최대: 2
고위험 독립 리뷰 포함: 최대 3
```

병렬 실행 조건:

* slice 간 dependency 없음
* write-set 겹침 없음
* shared contract 동시 변경 없음
* 개별 worktree 존재
* 개별 검증 가능
* 통합 검증 가능
* handoff 비용보다 병렬화 이익이 큼

역할은 장문 페르소나가 아니라 입출력 계약으로 정의한다.

```json
{
  "role": "reviewer",
  "permissions": "read_only",
  "objective": "public contract compatibility를 검토한다",
  "output": {
    "verdict": "",
    "findings": [],
    "risks": []
  }
}
```

---

# 21. 프로젝트 Knowledge 전략

## 21.1 Authority

SQLite Project Knowledge가 authority다.
생성되는 `AGENTS.generated.md` 등의 파일은 읽기용 projection이며 authority가 아니다.

## 21.2 Canonical Record Type

현재 canonical type은 13개다.

* policy_anchor
* semantic_fact
* architecture_decision
* domain_term
* component_boundary
* api_contract
* kg_relation
* ontology_constraint
* episodic_observation
* known_failure_pattern
* required_verification
* provenance_event
* knowledge_candidate

`tacit_observation`, `tacit_practice`는 canonical type이 아니라 `episodic_observation`으로 정규화되는 alias다.

새 type은 쉽게 추가하지 않고 `kind`로 분화한다.

```json
{
  "type": "semantic_fact",
  "kind": "code_landmark"
}
```

## 21.3 Freshness

각 knowledge record에는 다음을 연결한다.

```json
{
  "sourceRefs": [],
  "sourceDigest": "",
  "lastVerifiedAt": "",
  "freshnessPolicy": "verify_on_source_change",
  "confidence": 0.95
}
```

Source digest가 달라졌다고 즉시 폐기하지 않는다.

```text
source digest 변경
→ cheap re-verify
→ symbol/path 존재 확인
→ 유지 또는 stale 확정
```

비용이 큰 재검증은 해당 knowledge가 실제 사용될 때 수행한다.

---

# 22. 내부 구조

외부 하네스 명칭을 제품 구조에 남기지 않는다.

```text
scripts/kernel/task/
  task-contract.mjs
  evidence-plan.mjs
  project-mode.mjs
  context-build.mjs

scripts/kernel/run/
  run-loop.mjs
  execution-cursor.mjs
  workspace-identity.mjs
  attempts.mjs
  leases.mjs

scripts/kernel/proof/
  proof-executor.mjs
  verification-discovery.mjs
  proof-policy.mjs
  review-pipeline.mjs
  completion-decision.mjs

scripts/kernel/workspace/
  worktree-lifecycle.mjs
  git-closeout.mjs

scripts/kernel/knowledge/
  context-load.mjs
  invalidation.mjs
  projector.mjs
  commit.mjs
```

금지되는 이름:

```text
ouroboros-seed.mjs
lazycodex-boulder.mjs
superpowers-review.mjs
```

참조 사상은 provenance와 설계 근거로만 남긴다.

---

# 23. 현재 구현 기준선과 Gap

## 이미 구현

* 단일 공개 `moon-relay-kernel`
* internal capability 10개
* 7상태 workflow
* 위험 기반 route
* SQLite Run·verification·knowledge state
* source identity의 Run 시작 시 런타임 계산
* completion 형식 무결성 검사
* knowledge lifecycle
* Git closeout
* promotion hard gate
* context token policy

Catalog에는 internal capability 10개가 등록돼 있다.

## 핵심 Gap

| ID  | Gap                                               | 우선순위 |
| --- | ------------------------------------------------- | ---- |
| G1  | Proof Executor 부재                                 | 치명적  |
| G2  | 실행 중 workspace identity 추적 부재                     | 치명적  |
| G3  | Host Integration Contract와 coarse runtime loop 부재 | 높음   |
| G4  | Project Mode Detector 부재                          | 중간   |
| G5  | catalog allowedStages와 workflow 불일치               | 낮음   |
| G6  | 일반 feature route의 SHAPE 상시 삽입                     | 중간   |
| G7  | proof tier 의미·floor 불일치                           | 중간   |
| G8  | leases·attempts 미연결                               | 낮음   |
| G9  | measurement 대부분 unavailable                       | 중간   |
| G10 | evidence pack과 사람용 문서 개념 혼재                       | 해결   |
| G11 | capability authority 간 불일치                        | 낮음   |

Workflow는 7단계지만 catalog 공개 entrypoint의 allowed stages에는 SLICE와 SCHEDULE이 누락돼 있다.

---

# 24. 런타임 복잡도 통제

## 24.1 Hard Gate

* 동일 사실에 두 authority 금지
* writer·reader·test 없는 schema 금지
* enforcement code와 test 없는 정책 금지
* 미사용 lease·attempt schema는 P1 종료까지 연결하거나 제거
* 새 모델 가시 개념은 성능 저하 방지 Gate 없이 추가 금지

## 24.2 Architecture Review Trigger

다음은 차단 조건이 아니라 architecture review 조건이다.

* 한 단계에서 production LOC 2,500 이상 증가
* 신규 DB table 2개 초과
* 새로운 정책 surface 추가
* 새로운 public command 추가
* 모델 가시 concept 추가

## 24.3 Migration

현재 DB-open 시 idempotent `ALTER TABLE` 방식을 P0·P1에서 유지한다.
테이블 재작성 등 복잡한 migration이 필요해질 때 명시적 schema version migration으로 전환한다.

---

# 25. 단계별 구현 로드맵

## P0 — 신뢰 경계와 Host 경계

목표:

> 기존 프로젝트의 작은 버그 수정 하나를 사용자 요청 한 번으로 수행하고, Kernel이 직접 실행한 focused test evidence로 완료한다.

### P0-A. Host Contract

* `next`·`report` schema
* Host/Kernel 책임 분리
* provider dependency 추가 금지
* 저수준 명령 비노출

### P0-B. Workspace Identity

* runStart/current/verified identity 분리
* identity 변화 기반 mutation revision
* 완료 identity 검사

### P0-C. Trusted Proof Executor

* manifest script 실행
* command/args 분리
* timeout
* cwd
* output digest
* redaction
* `networkPolicy=inherited`

### P0-D. 최소 E2E Loop

```text
FRAME → EXECUTE → PROVE → CLOSE
```

지원 범위:

* 기존 프로젝트
* 작은 버그 수정
* trusted focused test 존재
* 단일 에이전트
* 현재 workspace 또는 단일 worktree

### P0-E. 계약 정합성

* allowedStages 7단계
* 기본 route에서 SHAPE 제거
* proof tier 의미·floor 정리
* evidence class
* caller-attested proof 완료 권위 제외
* capability authority 정합화

### P0-F. 측정

* E2E completion
* hard evidence coverage
* prompt token budget

---

## P1 — 재개 가능성과 Brownfield 안정성

* durable cursor
* deterministic resume
* leases·attempts 연결 또는 제거
* Project Mode Detector
* Brownfield Evidence Scan
* Baseline Proof
* failure classification
* route escalation
* discovered/ad-hoc command 승인
* flaky·BLOCKED 규약
* user intervention 측정
* sentinel evaluation set 구축

---

## P2 — Greenfield·Knowledge·격리

* Greenfield bootstrap
* walking skeleton 생성
* project topology projection
* knowledge freshness
* cheap re-verify
* network sandbox 검증
* `networkPolicy=blocked`
* migration workflow

---

## P3 — 선택적 품질 확대

* Contract → Engineering 2단계 review
* independent reviewer
* bounded multi-agent
* safe wave 실제 실행
* 측정 기반 model routing
* stagnation detection
* replan

P0·P1 목표를 충족하기 전에 P3를 기본 활성화하지 않는다.

---

# 26. 평가

## P0 지표

1. E2E completion
2. hard evidence coverage
3. prompt token budget

## P1 이후 North-star

1. E2E completion rate
2. sentinel false completion count
3. hard evidence coverage
4. user intervention count
5. static + stage prompt tokens

## False Completion Gate

```text
dogfood:          0 / 20
preview:          0 / 50
stable-candidate: 0 / 100
```

이는 실서비스 전체 false completion이 0이라는 뜻이 아니다.
고정 sentinel set에서 관측된 false completion이 0이라는 뜻이다.

Promotion policy에도 false completion 0이 hard gate로 선언돼 있다.

필수 기록:

* task set revision
* 모델
* Kernel revision
* evaluation seed
* reviewer
* task 수
* 결과

---

# 27. 성능 저하 방지 Gate

새 기능을 도입할 때 다음을 평가한다.

1. 모델이 알아야 할 개념이 증가하는가?
2. 한 작업에서 읽을 지침이 증가하는가?
3. 자연스럽게 해결할 문제에 강제 절차가 추가되는가?
4. 모델이 코드보다 하네스 상태를 더 많이 생각하게 되는가?
5. 런타임 hard gate를 위반하거나 architecture review를 통과하지 못하는가?

하나라도 명확한 `예`라면:

* 런타임 내부로 숨기거나
* 기능을 축소하거나
* 위험 조건부로 바꾸거나
* 다음 단계로 연기한다.

---

# 28. Relay 복잡도로 회귀하는 위험 신호

* 모든 작업에서 계획 문서를 생성
* 모든 작업이 SHAPE·SCHEDULE을 통과
* 작은 수정에도 worktree 생성
* 모든 변경에 독립 reviewer 호출
* 기본 다중 에이전트
* 모델에게 단계 이름과 상태 전이 노출
* 전체 Knowledge Graph 주입
* 동일 acceptance를 여러 에이전트에 반복 전달
* 내부 capability 수의 지속적 증가
* 코드보다 하네스 규칙을 더 많이 읽음
* 완료 정확도보다 절차 준수를 우선함
* Kernel 코어에 provider client 추가
* 검증하지 않은 security isolation 선언

---

# 29. 완료 기준

## P0 기능

```text
[ ] 사용자 요청 한 번으로 작은 버그 수정 E2E 완료
[ ] 모델은 next/report 외 저수준 Kernel 명령을 사용하지 않음
[ ] Kernel 코어에 모델 provider client가 없음
[ ] Kernel runtime이 trusted verification 명령을 직접 실행
[ ] executable obligation에 hard evidence 필수
[ ] judgment obligation은 structured judgment로 충족
[ ] 세 workspace identity가 분리 저장됨
[ ] mutation revision이 실제 identity 변화로 증가
[ ] evidence plan 없는 acceptance는 실행 차단
[ ] flaky obligation은 기본 blocking
[ ] network isolation 상태를 사실대로 기록
```

## 철학

```text
[ ] 공개 스킬 1개
[ ] 모델 가시 runtime command 2개
[ ] Always-on 5~8개
[ ] 기본 agent 1개
[ ] 기본 경로에 불필요한 SHAPE·SLICE·SCHEDULE 없음
[ ] 자동 생성 사람용 문서 0
[ ] 내부 분류 체계를 prompt에 노출하지 않음
[ ] 모델이 코드와 evidence에 집중함
```

## 런타임

```text
[ ] 중복 authority 0
[ ] 미사용 schema 0
[ ] enforcement 없는 policy 0
[ ] 모든 신규 schema에 writer·reader·test 존재
[ ] architecture review trigger 초과 시 review 기록 존재
[ ] capability authority 간 불일치 없음
```

---

# 30. 비목표

이번 전략은 다음을 목표로 하지 않는다.

* 기존 Relay를 즉시 제거
* Relay 데이터베이스 migration
* 전체 Ouroboros 방법론 이식
* 전체 LazyCodex/OmO 이식
* 전체 Superpowers 방법론 이식
* 기본 10개 이상 subagent
* 모든 작업의 PRD·SPEC·ADR·PLAN
* 무한 자기 반복
* 기본 다중 모델 합의
* Kernel 자체 모델 provider
* 모든 환경에서 즉시 가능한 network sandbox

---

# 31. 최종 결론

Kernel이 가져올 것은 오픈소스 하네스의 전체 방법론이 아니다.

```text
우로보로스
- 실행 계약
- evidence lineage
- 위험 기반 평가

LazyCodex
- 관련 프로젝트 컨텍스트
- durable progress와 resume

Superpowers
- 조건부 worktree
- TDD와 systematic debugging
- contract review와 engineering review 분리
```

이 개념들은 독립 스킬, 강제 단계, 역할별 장문 프롬프트로 구현하지 않는다.

다음 Kernel primitive로 흡수한다.

```text
Compact Task Contract
Durable Run State
Relevant Project Context
Evidence Gate
```

최종 Kernel의 본질은 다음과 같다.

> **내부적으로는 충분히 정교하지만, 모델에게는 목적·acceptance·관련 코드·현재 evidence만 보이는 개발 런타임.**

이 원칙을 유지하면 Kernel은 기존 Relay의 프롬프트 복잡도로 돌아가지 않으면서도, 신규 프로젝트와 기존 프로젝트 모두에서 실제 개발 작업을 E2E로 완료할 수 있다.
