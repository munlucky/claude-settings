# Harness Engineering Gap Analysis

Last-Reviewed: 2026-03-30

## 역할

- canonical assessment

이 문서는 현재 `claude-settings` 저장소를 기준 모델에 비춰 평가하고 갭을 정리한다.
상세 적용안은 `harness-application-ideas.md`, 실행 상태는 `implementation-backlog.md`를 canonical source로 본다.

## 목적

이 문서는 현재 `claude-settings` 저장소를 하네스 엔지니어링 관점에서 평가하고, 외부 기준 모델과의 갭을 정리하기 위한 분석 문서다.

비교 기준은 다음 두 축으로 잡는다.

- 3대 레이어: 의사결정, 프로세스, 지식
- 5대 핵심 기둥: 도구 오케스트레이션, 가드레일/안전 제약, 에러 복구/피드백 루프, 관측 가능성, 인간 참여 체크포인트

## 평가 대상

- 현재 저장소: `claude-settings`
- 핵심 근거 파일:
  - `.claude/PROJECT.md`
  - `.claude/verification.contract.yaml`
  - `.claude/rules/workflow.md`
  - `.claude/scripts/workflow-enforcement.sh`
  - `.claude/scripts/agent-loop.sh`
  - `.claude/agents/verification/verify-changes.sh`
  - `.claude/docs/guidelines/long-running-harness.md`
  - `.claude/docs/guidelines/verification-contract.md`

## 총평

현재 저장소는 하네스 엔지니어링의 초보 단계는 이미 지난 상태다.

특히 다음은 강하다.

- 실행 plane, strict mode, verification contract, workflow evidence를 통한 의사결정/거버넌스
- `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md` 중심의 실행 프로세스
- `.claudeignore`, protected path, code policy, workflow enforcement 기반의 안전 제약

반면 다음은 약하거나 아직 저장소 범위를 넘어선다.

- 제품 가치와 범위 조절을 위한 상위 전략 게이트
- TDD 우선 강제와 테스트 없는 코드 차단
- 경험이 자동 축적되는 지식 복리 구조
- DORA/SPACE/비용/품질 추세를 보는 조직 단위 관측 계층
- OPA/Policy-as-Code, IDP 골든 패스 같은 기업 플랫폼 연계

정리하면 현재 저장소는 `강한 로컬 실행 하네스`이고, `기업형 하네스 플랫폼`으로 가기 위한 상위 거버넌스와 관측 계층은 더 필요하다.

## 레이어별 분석

### 1. 의사결정 레이어

#### 현재 강점

- `executionPlane`, `workflowProfile`, readiness gate가 이미 구조화돼 있다.
- `meta_harness` 변경은 strict 경로로 승격된다.
- `policySets`, `requiredChecks`, `strict.triggers`를 통해 정책 번들 개념을 갖고 있다.
- planning closeout 이후에는 구현-리뷰-검증 루프를 자율적으로 유지하도록 규칙화돼 있다.

#### 현재 한계

- 제품 가치, 범위 조절, 사업 임팩트를 독립적으로 판단하는 상위 리뷰 레이어가 없다.
- 아키텍처 완결성 검토가 별도 강제 게이트라기보다 현재 오케스트레이터와 리뷰 체인 속에 흡수돼 있다.
- `policySets`는 저장소 내부 추상화이며 외부 Policy-as-Code 엔진과 직접 연결되지 않는다.

#### 갭 진단

현재 저장소는 `실행 준비 여부`는 잘 판단하지만, `이 작업을 해야 하는가`, `지금 범위를 키워야 하는가 줄여야 하는가` 같은 전략적 게이트는 상대적으로 약하다.

#### 우선 조치

- `plan-ceo-review`에 해당하는 제품/범위 판단 스킬 추가
- `plan-eng-review`에 해당하는 아키텍처/완결성 판단 스킬 추가
- `verification.contract.yaml`의 `policySets`를 외부 OPA/Rego 정책으로 매핑하는 설계 문서 추가

### 2. 프로세스 레이어

#### 현재 강점

- 기본 플로우 `intake -> plan -> ready/isolate -> execute -> review -> verify -> finish/handoff`가 명확하다.
- phase 기반 장기 실행에 필요한 상태 문서와 점수 기반 closeout 구조가 있다.
- `workflow-enforcement.sh`가 증거 없는 종료를 막는다.
- `verify-changes.sh`와 `completion-verifier`가 contract-first 검증을 수행한다.
- generator/evaluator separation 관점이 이미 반영돼 있다.

#### 현재 한계

- TDD-first가 기본 규율로 강제되지는 않는다.
- 실패 테스트 없이 구현된 코드를 차단하는 하드 규칙이 없다.
- 서비스 생성, Day-2 운영, 배포까지 연결되는 골든 패스 포털은 없다.
- downstream 프로젝트에서 실제 파이프라인/배포까지 이어지는 표준 오케스트레이션은 저장소 밖에 남아 있다.

#### 갭 진단

현재 프로세스는 `문서-검증-종료 규율`은 매우 강하지만, `작업 단위 세분화`와 `테스트 우선 실행`의 실행 하중을 더 줄일 필요가 있다.

#### 우선 조치

- TDD 우선 스킬 또는 gate 추가
- bounded work에도 bite-sized task decomposition을 강제하는 규칙 추가
- downstream 프로젝트용 골든 패스 템플릿 설계

### 3. 지식 레이어

#### 현재 강점

- TOC와 source-of-truth 분리 원칙이 분명하다.
- freshness, link integrity, localization parity를 감사한다.
- task-scoped 문서 메모리 구조가 있다.
- `session-logger`와 handoff 구조가 이미 존재한다.

#### 현재 한계

- `docs/solutions/`류의 해결 사례 저장소가 없다.
- 실패 원인, 해결 전략, 재발 방지 지식이 다음 계획 단계에서 자동 재사용되지 않는다.
- 운영 데이터, 검증 결과, 문서 메모리가 하나의 검색 가능한 지식 계층으로 통합되지 않는다.
- semantic retrieval, knowledge graph, RCA 재활용 구조가 없다.

#### 갭 진단

현재 저장소는 `지식 저장소의 품질 유지`에는 강하지만, `경험을 복리화하는 엔진`으로는 아직 부족하다.

#### 우선 조치

- `docs/solutions/` 또는 동등한 패턴 라이브러리 도입
- `QA_REPORT/HANDOFF -> solution asset` 승격 규칙 추가
- retrieval-ready 인덱싱 메타데이터 설계

## 5대 핵심 기둥 평가

| 기둥 | 현재 수준 | 근거 | 핵심 갭 |
|---|---|---|---|
| Tool Orchestration | 강함 | installer, runtime adapter, phase dispatch, browser runtime | 외부 배포/IDP 플랫폼 연계 부족 |
| Guardrails & Safety Constraints | 강함 | `.claudeignore`, security rule, code policy, workflow enforcement | 조직 정책 엔진과의 연결 부족 |
| Error Recovery & Feedback Loops | 중상 | retry loop, scorecard, QA/Handoff, verifier artifacts | RCA 자산화와 자동 복구 루프 부족 |
| Observability | 중하 | verdict JSON, agent-loop logs, workflow evidence | DORA/SPACE/비용/품질 대시보드 부재 |
| HITL Checkpoints | 중 | planning-closeout, blocker, destructive-risk approval | 위험 등급별 승인 체계와 운영 승인 노드 부족 |

## 우선순위별 갭

### P1

- 전략적 의사결정 레이어 보강
- 지식 복리화를 위한 solution memory 도입
- OPA/Policy-as-Code 연계 경로 설계

### P2

- TDD-first 강제
- downstream golden path 템플릿화
- trace grading 또는 동등한 evaluator scoring 설계

### P3

- 조직 단위 관측 가능성 계층
- 서비스 스코어카드/성숙도 대시보드
- 운영 데이터와 문서 지식의 통합 검색

## 권장 로드맵

상세 실행 단위와 상태는 `implementation-backlog.md`에서 추적한다.

### 0-3개월

- `harness-engineering-foundation` 기준 문서 정립
- `plan-ceo-review`, `plan-eng-review`에 해당하는 내부 스킬 설계
- `docs/solutions/` 구조 초안 추가

### 3-6개월

- `policySets -> OPA/Rego` 매핑 명세 작성
- TDD gate와 테스트 없는 구현 차단 규칙 도입
- solution asset 자동 승격 규칙 도입

### 6-12개월

- downstream 프로젝트용 골든 패스 템플릿
- 프로젝트 성숙도/검증 성숙도 scorecard 정교화
- trace/eval 기반 평가 루프 추가

### 12개월 이후

- 조직 단위 지식 그래프 또는 시맨틱 검색
- 파이프라인/배포/장애 데이터와 하네스 문서 계층 연결
- AaaS 스타일 자율 유지보수 시나리오 검토

## 판단

현재 저장소는 하네스 엔지니어링의 `프로세스 운영체제`로는 충분히 경쟁력이 있다.

다만 장기적으로는 다음 전환이 필요하다.

- 로컬 규율 중심 하네스 -> 전략적 의사결정 하네스
- 문서 품질 중심 지식 저장소 -> 경험 복리형 지식 시스템
- 저장소 내부 정책 번들 -> 조직 정책 엔진과 연결된 플랫폼 거버넌스

이 문서의 결론은 단순하다.

현재 저장소는 `하네스 엔지니어링의 기반`은 이미 갖췄다.
다음 단계의 핵심은 `전략`, `지식 복리`, `관측`, `정책 외부화`다.

## 관련 문서

- `docs/claude-tasks/harness-engineering-foundation/README.md`
- `docs/claude-tasks/harness-engineering-foundation/harness-engineering-foundation.md`
- `docs/claude-tasks/harness-engineering-foundation/harness-application-ideas.md`
- `docs/claude-tasks/harness-engineering-foundation/implementation-backlog.md`
