# 장시간 실행 하네스 가이드

> Anthropic의 2026년 3월 24일 글, "Harness design for long-running application development"를 현재 Moonshot 워크플로우에 맞게 실무형으로 재정리한 문서입니다.

## 한 줄 요약

몇 시간짜리 앱 개발에서는 모델 자체 성능보다도, 계획, 구현, 평가, 핸드오프를 어떻게 분리하고 반복시키는지가 결과 품질을 크게 좌우합니다.

## 핵심 주장

### 1. 하네스 품질도 성능이다

Anthropic이 보여준 차이는 "모델이 더 똑똑해졌다"가 아니라 "모델을 둘러싼 실행 구조가 더 좋아졌다"에 가깝습니다.

중요했던 요소:
- 한 에이전트에 몰지 않는 역할 분리
- 반복 가능한 피드백 루프
- 실패 가능한 완료 기준
- 장시간 작업을 이어주는 핸드오프 아티팩트

### 2. 자기평가는 약하다

생성 에이전트는 자기 결과물을 대체로 후하게 평가합니다.

실무 규칙:
- 만든 에이전트가 최종 완료 판정을 내리지 않는다
- QA, 브라우저 검증, 완료 판정은 별도 evaluator 경로로 분리한다

### 3. 모호한 품질 표현을 채점 가능한 기준으로 바꿔야 한다

"좋아 보인다", "잘 동작한다"는 하네스 입력으로 약합니다.

아래처럼 실패 가능한 기준으로 바꿉니다.
- 사용자가 추측 없이 핵심 흐름을 완료할 수 있다
- 드래그 채우기 도구가 시작점/끝점만 찍지 않고 실제 영역을 채운다
- API 라우트 순서 때문에 특정 엔드포인트가 가려지지 않는다
- UI가 의도한 비주얼 방향을 유지하고 템플릿/기본값 느낌으로 무너지지 않는다

### 4. 상위 spec과 코드 작성 사이에는 브리지 문서가 필요하다

Anthropic은 고수준 제품 spec과 실제 구현 사이에 `Sprint Contract`를 두었습니다.

이 문서는 아래를 먼저 합의하기 위한 장치입니다.
- 이번 라운드에서 정확히 무엇을 만들지
- 이번 라운드에서 일부러 만들지 않을 것은 무엇인지
- 무엇으로 완료를 검증할지
- 어떤 실패가 라운드 실패를 의미하는지

### 5. 긴 작업은 명시적 핸드오프 상태가 필요하다

compaction은 도움이 되지만, 장시간 작업의 표류를 항상 막아주지는 않습니다. 세션 전환을 안전하게 만드는 핸드오프 문서가 필요합니다.

핸드오프에 꼭 남겨야 할 것:
- 현재 목표
- 완료한 것
- 실패한 시도와 실패 이유
- 열린 위험
- 다음 단계

### 6. 모델이 좋아지면 하네스 복잡도도 다시 검증해야 한다

하네스의 각 부품은 "모델 혼자 못하는 것"에 대한 가정입니다.

따라서 예전 복잡도를 그대로 고정하면 안 됩니다.
- raw prompt만으로 범위가 줄어들면 planner는 계속 필요
- solo 품질 경계를 넘는 작업이면 evaluator는 계속 필요
- 모델이 충분히 오래 일관성을 유지하면 per-sprint scaffolding은 줄일 수 있음

## Moonshot 적용 원칙

### 최소 하중 구조

`product_project`의 medium/complex 작업은 아래 구조를 기본으로 둡니다.
1. planner 산출물: `PRODUCT_INTENT -> PRD -> SOLUTION -> SPEC -> PLAN`
2. slice별 계약 문서: `SPRINT_CONTRACT.md`
3. 구현 실행
4. evaluator 산출물: `QA_REPORT.md`
5. 필요 시 세션 인계 문서: `HANDOFF.md`

### 역할 매핑

현재 워크플로우에 대응시키면 다음과 같습니다.
- Planner: `product-orchestrator`, `requirements-analyzer`, `context-builder`
- Generator: `implementation-runner`
- Evaluator: `completion-verifier`, `browser-verifier`, `verify-changes.sh`, `verify-runtime.sh`, `codex-review-code`

### 아티팩트 책임

`SPRINT_CONTRACT.md`
- 이번 slice 목표를 테스트 가능한 언어로 고정
- 이번 라운드 non-goal 명시
- hard pass/fail 체크 정의

`QA_REPORT.md`
- 실패한 기준, 재현 메모, 판정을 기록
- 다음 구현 라운드의 입력이 됨

`HANDOFF.md`
- 장시간 세션이나 context reset 시 상태를 안전하게 인계

## 운영 규칙

### Sprint Contract가 필요한 경우

아래 중 하나라도 해당하면 `SPRINT_CONTRACT.md`를 요구합니다.
- 작업이 medium 또는 complex
- UI, API, 데이터 흐름이 함께 바뀜
- 사용자에게 보이는 동작이 여러 개 얽혀 있음
- 검증 경로가 단순 빌드 체크를 넘어감

반대로 단순 국소 수정은 생략할 수 있습니다.

### Evaluator 분리가 필요한 경우

아래 경우는 별도 evaluator를 둡니다.
- 사용자 체감 런타임 동작이 중요함
- 브라우저 플로우나 시각 품질이 포함됨
- 정적 리뷰로 놓치기 쉬운 실패 모드가 있음
- 유사 작업에서 모델이 stub 또는 반쯤 동작하는 기능을 자주 냈음

### 작업 크기별 review cadence

review는 마지막 의식이 아니라 반복 stage로 다룹니다.

Simple work:
- 구현 후 한 번의 집중 리뷰로 충분한 경우가 많다
- 변경 범위가 아주 국소적이고 결정적일 때만 생략 가능하다

Medium work:
- 첫 의미 있는 구현 배치 뒤에 한 번 리뷰한다
- 리뷰 피드백으로 코드가 바뀌면 fix-forward 뒤에 다시 집중 리뷰한다

Complex 또는 long-running work:
- 구현 시작 전 plan을 리뷰한다
- verifier 상태를 올리기 전에 의미 있는 구현 배치마다 리뷰한다
- remediation round가 동작, 계약, 사용자 흐름을 바꿨으면 리뷰를 다시 돈다

실무상 기본 review owner:
- `codex-review-code`: 기본 의미/회귀 리뷰
- `security-reviewer`: 보안 민감 파일 또는 흐름 변경 시
- `audit`, `web-design-guidelines`: UI/UX 품질이 완료 기준일 때

### HANDOFF가 필요한 경우

아래 경우는 `HANDOFF.md`를 남깁니다.
- 세션 길이가 길어져 컨텍스트 한계에 접근함
- 다음 세션에서 이어서 작업할 예정
- 실패 기준이 아직 열려 있음
- 여러 에이전트/리뷰어가 동일 상태를 공유해야 함

재개나 재시도 비용이 반복해서 커지기 시작하면, `HANDOFF.md`를 임시 상태 로그처럼 키우지 말고 `resumable-session-layer.md`의 런타임 계약을 추가합니다.

### Finish / handoff 결정 흐름

종료 경로를 고르기 전에 먼저 하나를 확인합니다.

- 남아 있는 in-scope 요구사항, 시나리오, 다음 phase 가 있고 현재 세션에서 안전하게 계속 밀 수 있는가?
- 그렇다면 계속 진행합니다. checkpoint 증거가 확보됐거나 문서가 정리됐다는 이유만으로 멈추지 않습니다.

검증 뒤에는 아래 셋 중 하나만 선택합니다.

1. Clean finish
   - 최신 증거와 함께 verification이 통과함
   - 이번 요청 범위의 in-scope 작업이 실제로 끝남
   - 문서/세션 마감 단계를 실행함
   - resumable handoff는 필요하지 않으며, `HANDOFF.md`가 있더라도 재개용 문서가 아니라 clean-finish marker로 정리되어야 함
2. Resume-later handoff
   - verification이 미완료, 차단, 의도적 보류 상태이거나 컨텍스트/런타임/사용자 pause로 세션이 중단됨
   - `QA_REPORT.md`를 갱신함
   - `HANDOFF.md`를 남김
3. Retry loop
   - verification이 수정 가능한 실패를 반환함
   - `QA_REPORT.md`를 갱신함
   - contract에 연결된 remediation 입력으로 구현 단계로 되돌아감

유효하지 않은 handoff 사유:
- "checkpoint까지 왔음"
- "문서 정리 완료"
- "QA 반영 완료"
- "phase 하나 끝났음"
- "중간 진행 보고를 보낼 타이밍"
- 실제 중단 조건 없이 마일스톤만 언급하는 표현 전부

기본 finish-stage 책임:
- 의미 있는 문서 drift가 있으면 `doc-auto-sync`
- 재개 가능 상태나 의사결정 이력이 필요하면 `session-logger`
- 중단 안전한 런타임 상태와 bounded improvement telemetry가 필요하면 `resumable-session-layer.md`
- handwritten verdict JSON 대신 `.claude/scripts/write-verification-verdict.py`로 저장소 루트 `.claude/verification-verdict-*.json`을 구조화해서 생성
  completion gate가 같은 산출물을 검증할 수 있도록 정확한 verdict 파일 경로를 `QA_REPORT.md`에 함께 기록
- `commit-moonshot`은 사용자가 메모리 현행화와 커밋을 함께 원할 때만 실행
  이 명시적 opt-in 경로에서만 `AGENT_LOOP_RUN_COMMIT_PROMPT=true`를 사용
  이 opt-in이 없으면 closeout 로그도 정책상 비활성화로 표시되어야 함

## 피해야 할 안티패턴

피해야 할 것:
- multi-slice 작업을 PRD에서 바로 코드로 점프시키기
- generator가 자기 결과만 보고 완료 선언하기
- acceptance criteria를 모호한 문장으로만 쓰기
- 비용 대비 가치 검토 없이 evaluator를 모든 작업에 고정 삽입하기
- 모델이 더 이상 필요로 하지 않는 하네스 복잡도를 그대로 유지하기

## 점검 질문

워크플로우를 손볼 때는 먼저 아래를 확인합니다.
1. 현재 모델과 작업에서 진짜 load-bearing인 부품은 무엇인가
2. 완료 기준 중 재현 가능한 실패로 바꿀 수 있는 것은 무엇인가
3. evaluator가 정적 출력이 아니라 실제 런타임을 보고 있는가
4. 지금 세션이 끊겨도 다음 에이전트가 문서만으로 재개 가능한가
