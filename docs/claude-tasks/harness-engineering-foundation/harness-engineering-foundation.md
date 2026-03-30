# Harness Engineering Foundation

Last-Reviewed: 2026-03-30

## 역할

- canonical foundation

이 문서는 하네스 엔지니어링의 기준 모델과 공통 언어를 정의한다.
현재 저장소 평가나 구체 실행 항목은 아래 문서를 우선 본다.

- assessment: `docs/claude-tasks/harness-engineering-foundation/gap-analysis.md`
- proposals: `docs/claude-tasks/harness-engineering-foundation/harness-application-ideas.md`
- execution backlog: `docs/claude-tasks/harness-engineering-foundation/implementation-backlog.md`

## 목적

이 문서는 하네스 엔지니어링을 이론적, 구조적, 실무적으로 정립하기 위한 기준 문서다.

여기서 하네스 엔지니어링은 단순히 AI 코딩 도구를 잘 쓰는 방법이 아니라, AI 에이전트가 신뢰할 수 있는 결과를 내도록 환경, 제약, 검증, 지식, 관측 체계를 설계하는 엔지니어링 규율로 정의한다.

## 왜 필요한가

AI 코딩 시대의 병목은 더 이상 "코드를 빨리 쓰는 능력"이 아니다.
진짜 병목은 다음 다섯 가지다.

- 무엇을 만들지 결정하는 능력
- 그 결정을 일관된 워크플로우로 실행하는 능력
- 실패를 빠르게 복구하는 능력
- 학습을 자산으로 축적하는 능력
- 위험한 행위를 제한하면서도 생산성을 유지하는 능력

즉, 모델 성능만으로는 생산성이 안정화되지 않는다.
생산성을 결정하는 것은 모델 위에 얹힌 하네스의 품질이다.

## 외부 리서치에서 도출한 핵심 명제

### 1. 하네스는 모델보다 먼저 설계돼야 한다

Anthropic은 2024년 12월 19일 공개한 글에서 성공적인 구현이 복잡한 프레임워크보다 `simple, composable patterns`를 사용했다고 설명했다.

핵심 메시지:

- 먼저 단순한 패턴으로 시작한다.
- 필요할 때만 복잡성을 늘린다.
- 도구 인터페이스와 환경 피드백을 명확히 설계한다.

출처:

- Anthropic, *Building Effective AI Agents*, 2024-12-19  
  https://www.anthropic.com/engineering/building-effective-agents

### 2. 에이전트는 자율적이어야 하지만 무제한이어서는 안 된다

Anthropic은 에이전트가 실행 중 `ground truth`를 환경에서 받아야 하며, 체크포인트나 blocker 시점에 인간 피드백을 받을 수 있어야 한다고 정리했다.

OpenAI도 Agent Builder 안전 가이드에서 MCP 사용 시 human approval node, tool approvals, guardrails, trace grading을 권장한다.

출처:

- Anthropic, *Building Effective AI Agents*, 2024-12-19  
  https://www.anthropic.com/engineering/building-effective-agents
- OpenAI, *Safety in building agents*, accessed 2026-03-30  
  https://platform.openai.com/docs/guides/agent-builder-safety
- OpenAI, *Node reference*, accessed 2026-03-30  
  https://platform.openai.com/docs/guides/node-reference

### 3. 실무 하네스는 계획-실행-리뷰-지식화의 루프를 가져야 한다

Superpowers는 `brainstorming -> worktrees -> writing-plans -> subagent-driven development -> test-driven-development -> code review -> finish` 순서를 강제한다.

Compounding Engineering은 `Brainstorm -> Plan -> Work -> Review -> Compound -> Repeat` 루프와 "각 단위 작업이 다음 작업을 더 쉽게 만들어야 한다"는 원칙을 전면에 둔다.

gstack의 `plan-ceo-review`는 범위 확장, 선택적 확장, 범위 유지, 범위 축소의 네 모드로 계획의 가치와 범위를 다시 판단하며, `Zero silent failures`, `Observability is scope` 같은 원칙을 강조한다.

출처:

- obra/superpowers, GitHub README, accessed 2026-03-30  
  https://github.com/obra/superpowers
- EveryInc/compounding-engineering-plugin, GitHub README, accessed 2026-03-30  
  https://github.com/EveryInc/compounding-engineering-plugin
- garrytan/plan-ceo-review, Agent Skill Hub, version 2026.03.21, accessed 2026-03-30  
  https://skhub.dev/u/garrytan/sk/plan-ceo-review

### 4. 기업 도입에서는 하네스가 플랫폼 기능으로 승격돼야 한다

Harness 공식 문서는 OPA/Rego 기반 policy step, DevOps Agent의 Error Analyzer와 Policy Generation, IDP의 self-service workflow와 scorecards를 제공한다.

즉, 기업 환경에서는 하네스가 개인 워크플로우를 넘어 다음을 포함해야 한다.

- 정책 엔진
- 셀프서비스 워크플로우
- 파이프라인 오케스트레이션
- 품질/보안/성숙도 scorecard
- 자동 RCA 및 요약

출처:

- Harness, *Add a Policy step to a pipeline*, updated 2025-01-27  
  https://developer.harness.io/docs/continuous-delivery/x-platform-cd-features/advanced/cd-governance/add-a-governance-policy-step-to-a-pipeline/
- Harness, *Overview of Harness AI*, accessed 2026-03-30  
  https://developer.harness.io/docs/platform/harness-ai/overview/
- Harness, *Harness IDP Adoption Playbook*, updated 2025-12-03  
  https://developer.harness.io/docs/internal-developer-portal/adoption/adoption-playbook/

## 정식 정의

하네스 엔지니어링은 다음과 같이 정의한다.

> AI 에이전트가 제한된 권한과 명시된 목표 아래에서, 계획 가능한 워크플로우와 검증 가능한 증거를 통해, 반복 가능한 품질 수준으로 소프트웨어 작업을 수행하도록 만드는 시스템 설계 규율

이 정의의 핵심 구성요소는 다섯 개다.

- 제한된 권한
- 명시된 목표
- 계획 가능한 워크플로우
- 검증 가능한 증거
- 반복 가능한 품질

## 권장 구조 모델

하네스 엔지니어링은 `3대 레이어 + 5대 기둥 + 1개 운영 루프`로 보는 것이 가장 실무적이다.

### 3대 레이어

#### 1. 의사결정 레이어

역할:

- 이 작업을 해야 하는지 판단
- 범위를 유지/확장/축소할지 결정
- 위험한 설계를 사전에 차단
- 아키텍처와 제품 가치를 실행 전 검토

대표 산출물:

- PRODUCT_INTENT
- PRD
- SPEC
- plan review verdict
- scope decision log

실무 질문:

- 지금 이 기능은 왜 필요한가
- 더 큰 방향이 있는가
- 지금 범위는 과한가 부족한가
- 이 설계는 6개월 후에도 유지 가능한가

#### 2. 프로세스 레이어

역할:

- 계획을 작업 가능한 단위로 나눔
- 구현, 리뷰, 검증, handoff 순서를 강제
- agent 간 상태 전달 아티팩트를 유지
- 종료 조건을 명확히 함

대표 산출물:

- implementation plan
- SPRINT_CONTRACT
- QA_REPORT
- HANDOFF
- SCORECARD
- verification verdict

실무 질문:

- 무엇을 먼저 할 것인가
- 언제 리뷰할 것인가
- 언제 멈춰야 하는가
- 다음 시도는 무엇을 입력으로 삼는가

#### 3. 지식 레이어

역할:

- 세션에서 얻은 학습을 휘발시키지 않음
- 패턴, 해결책, 안티패턴을 축적
- 다음 계획과 구현의 입력으로 재사용
- 문서와 운영 데이터를 연결

대표 산출물:

- solution note
- pattern library
- glossary
- runbook
- failure RCA
- retrievable knowledge asset

실무 질문:

- 이 문제를 전에 어떻게 풀었는가
- 어떤 패턴을 반복 사용해야 하는가
- 어떤 안티패턴을 피해야 하는가
- 신규 팀원이 무엇을 먼저 읽어야 하는가

## 5대 핵심 기둥

### 1. Tool Orchestration

에이전트가 어떤 도구를 어떤 범위에서 쓸 수 있는지 정의한다.

필수 요소:

- 파일 시스템 경계
- 셸/네트워크 권한
- tool selection rules
- sandbox / approval 모델
- tool documentation

실무 기준:

- 권한은 default deny
- destructive action은 explicit approval
- 도구 설명은 junior engineer에게 쓰는 docstring 수준으로 명확해야 함

### 2. Guardrails & Safety Constraints

에이전트가 하면 안 되는 행동과 반드시 지켜야 하는 규칙을 결정론적으로 만든다.

필수 요소:

- protected paths
- secrets exclusion
- lint/policy gate
- security checks
- policy-as-code

실무 기준:

- guardrail은 vague principle이 아니라 fail 가능한 rule이어야 함
- `보안`, `권한`, `데이터 유출`, `아키텍처 금지 패턴`은 기계적으로 막을수록 좋다

### 3. Error Recovery & Feedback Loops

한 번의 시도로 끝나지 않는다는 전제 위에 복구 구조를 만든다.

필수 요소:

- evaluator-optimizer loop
- retry policy
- stop conditions
- RCA capture
- fix-forward tasking

실무 기준:

- generator가 자기 자신을 완료로 판정하지 않게 한다
- 실패는 다시 시도 가능한 입력으로 변환돼야 한다
- 실패 원인은 다음 시도의 문맥으로 남아야 한다

### 4. Observability

에이전트가 무엇을 했고, 비용과 품질이 어땠는지 관찰할 수 있어야 한다.

필수 요소:

- trace
- tool call log
- verification result
- scorecard
- outcome metrics

실무 기준:

- "성공했다"보다 "어떤 증거로 성공이라 판단했는가"를 남긴다
- 최소 단위는 verdict artifact다
- 고도화 단계에서는 DORA, SPACE, defect escape, retry count, approval latency까지 본다

### 5. HITL Checkpoints

완전 자율이 아니라 책임이 필요한 지점에서 인간 판단을 개입시킨다.

필수 요소:

- planning closeout approval
- destructive action approval
- tool approval
- blocker escalation
- release/production approval

실무 기준:

- 인간 개입은 임의가 아니라 위험 기준에 따라 설계한다
- 저위험 읽기 작업까지 사람이 매번 승인하면 병목이 된다
- 고위험 쓰기/배포/권한 상승은 인간이 책임져야 한다

## 권장 운영 루프

실무용 하네스 엔지니어링 운영 루프는 아래 순서를 권장한다.

1. Intake
2. Decision Review
3. Plan
4. Contract
5. Execute
6. Review
7. Verify
8. Handoff or Finish
9. Compound Knowledge

### 각 단계의 목적

#### Intake

- 사용자 요청 수집
- 목표, 제약, 리스크, 범위 초안을 만든다

#### Decision Review

- 범위를 유지/확장/축소할지 결정
- 제품 가치와 아키텍처 무결성을 검토

#### Plan

- 작업을 실행 가능한 단위로 분해
- 필요한 파일, 검증, 역할을 지정

#### Contract

- 이번 라운드의 in-scope / out-of-scope를 명시
- 성공 조건과 중단 조건을 명시

#### Execute

- 가능한 한 작은 단위로 구현
- 환경 피드백을 계속 받음

#### Review

- generator와 분리된 evaluator가 리스크를 찾음

#### Verify

- 테스트, 런타임, 시나리오, 정책 준수 여부 확인

#### Handoff or Finish

- 미완료면 resume-safe 상태를 남김
- 완료면 종료 근거를 남김

#### Compound Knowledge

- 배운 패턴과 실패/해결을 reusable asset으로 저장

## 아티팩트 모델

하네스 엔지니어링은 대화보다 아티팩트 중심이어야 한다.

권장 최소 아티팩트는 다음과 같다.

| 구분 | 목적 | 예시 |
|---|---|---|
| Intent Artifact | 왜 하는지 정리 | PRODUCT_INTENT |
| Plan Artifact | 무엇을 할지 정리 | PLAN, task breakdown |
| Contract Artifact | 이번 라운드의 done 기준 | SPRINT_CONTRACT |
| Review Artifact | 리스크와 판단 기록 | code review, QA_REPORT |
| Verification Artifact | 증거와 verdict | verification JSON, runtime verdict |
| Handoff Artifact | 세션 재개 상태 | HANDOFF |
| Knowledge Artifact | 다음 작업을 쉽게 만드는 자산 | solution note, pattern doc |

## 역할 모델

하네스 엔지니어링에서는 인간과 에이전트의 역할을 다음처럼 구분하는 것이 좋다.

### 인간

- 목표 설정
- 범위 승인
- 고위험 승인
- 최종 책임

### Planner

- 요구 해석
- 범위 분해
- 계약 초안 생성

### Executor

- 코드/문서/설정 변경 수행

### Evaluator

- 리뷰
- 검증
- 점수화

### Platform/Harness Owner

- 규칙 관리
- 도구 권한 관리
- 정책 관리
- 지식 축적 구조 관리

## 성숙도 모델

### Level 0. Prompt-Only

- 규칙 없음
- 검증 없음
- 세션 종료와 함께 지식 소실

### Level 1. Guided Workflow

- 기본 규칙과 템플릿 존재
- 수동 검증 위주

### Level 2. Contracted Execution

- plan/contract/review/verify 아티팩트가 존재
- strict path와 required checks 존재

### Level 3. Policy-Governed Harness

- policy-as-code
- tool approvals
- traceable workflow evidence

### Level 4. Compounding Harness

- solution memory
- retrieval loop
- 조직 지식 축적

### Level 5. Platformized Harness

- IDP / self-service workflow
- scorecards
- observability
- pipeline and release integration

## 실무 도입 원칙

### 원칙 1. 단순한 패턴부터 시작한다

처음부터 복잡한 멀티에이전트 시스템을 만들지 않는다.
단순한 흐름과 명시적 문서, 검증 스크립트로 시작한다.

### 원칙 2. generator와 evaluator를 분리한다

작성한 에이전트가 완료를 최종 선언하지 않게 한다.
리뷰와 검증은 별도 경로에서 수행한다.

### 원칙 3. 완료 기준은 증거 기반이어야 한다

완료는 감각이 아니라 artifact로 남아야 한다.
최소 단위는 reproducible check와 verdict file이다.

### 원칙 4. 지식은 자동 승격돼야 한다

세션 로그만으로는 부족하다.
반복 가치가 있는 해결책은 solution asset으로 승격해야 한다.

### 원칙 5. 사람은 마지막 보험이 아니라 위험 기반 승인자여야 한다

사람은 모든 단계에 개입하지 않는다.
위험이 있는 단계에만 정확히 개입하도록 설계한다.

## 안티패턴

- 프롬프트만 길게 쓰고 워크플로우를 설계하지 않음
- 계획 없이 바로 구현
- 테스트나 런타임 검증 없이 "끝" 선언
- 실패 이유를 남기지 않고 새 세션에서 다시 시작
- 지식을 대화 로그에만 남기고 재사용 자산으로 승격하지 않음
- 모든 행동을 사람 승인에 묶어 자율성을 잃음
- 반대로 승인 없이 고위험 작업을 자동 실행함

## 현재 `claude-settings`에 주는 시사점

이 섹션은 foundation 관점의 짧은 연결 요약만 제공한다.
상세 평가는 `gap-analysis.md`, 실행 항목은 `implementation-backlog.md`를 canonical source로 본다.

현재 저장소는 이미 다음을 갖고 있다.

- contract-first verification
- workflow evidence
- long-running handoff artifacts
- protected paths and ignore strategy
- strict mode for meta-harness work

따라서 다음 단계는 기초를 다시 만드는 것이 아니다.
다음 네 가지를 위에 얹어야 한다.

- 전략적 decision review
- TDD-first execution reinforcement
- compounding knowledge assets
- platform-facing policy and observability integration

## 정리

하네스 엔지니어링은 `AI가 코드를 쓰게 하는 기술`이 아니다.
정확히는 다음을 동시에 만족시키는 시스템 설계다.

- 에이전트가 필요한 자율성을 가진다
- 자율성이 위험을 넘지 않게 제한된다
- 실패가 다음 시도의 입력으로 변환된다
- 경험이 다음 작업을 더 쉽게 만든다
- 사람은 병목이 아니라 책임 있는 승인자로 남는다

결국 엔지니어의 역할은 `코드 작성자`에서 `하네스 설계자`로 이동한다.
좋은 하네스는 좋은 모델보다 오래 간다.

## 참고 자료

### 공식/준공식 소스

- Anthropic, *Building Effective AI Agents*, Published 2024-12-19  
  https://www.anthropic.com/engineering/building-effective-agents
- OpenAI, *Agents*, accessed 2026-03-30  
  https://platform.openai.com/docs/guides/agents
- OpenAI, *Agents SDK*, accessed 2026-03-30  
  https://platform.openai.com/docs/guides/agents-sdk/
- OpenAI, *Node reference*, accessed 2026-03-30  
  https://platform.openai.com/docs/guides/node-reference
- OpenAI, *Agent evals*, accessed 2026-03-30  
  https://platform.openai.com/docs/guides/agent-evals
- OpenAI, *Safety in building agents*, accessed 2026-03-30  
  https://platform.openai.com/docs/guides/agent-builder-safety
- Harness, *Add a Policy step to a pipeline*, updated 2025-01-27  
  https://developer.harness.io/docs/continuous-delivery/x-platform-cd-features/advanced/cd-governance/add-a-governance-policy-step-to-a-pipeline/
- Harness, *Overview of Harness AI*, accessed 2026-03-30  
  https://developer.harness.io/docs/platform/harness-ai/overview/
- Harness, *Harness IDP Adoption Playbook*, updated 2025-12-03  
  https://developer.harness.io/docs/internal-developer-portal/adoption/adoption-playbook/
- obra/superpowers, GitHub README, accessed 2026-03-30  
  https://github.com/obra/superpowers
- EveryInc/compounding-engineering-plugin, GitHub README, accessed 2026-03-30  
  https://github.com/EveryInc/compounding-engineering-plugin
- garrytan/plan-ceo-review, Agent Skill Hub, version 2026.03.21, accessed 2026-03-30  
  https://skhub.dev/u/garrytan/sk/plan-ceo-review

## 관련 문서

- `docs/claude-tasks/harness-engineering-foundation/README.md`
- `docs/claude-tasks/harness-engineering-foundation/gap-analysis.md`
- `docs/claude-tasks/harness-engineering-foundation/harness-application-ideas.md`
- `docs/claude-tasks/harness-engineering-foundation/implementation-backlog.md`
