# Moonshot Phase Runner 사용자 워크플로우

> 처음 보는 사람이 `/moonshot-phase-runner`를 실제로 어떻게 쓰는지 이해하기 위한 설명서입니다.

## 한 줄 정의

`moonshot-phase-runner`는 큰 작업을 **여러 phase로 쪼개고, 각 phase를 계획 -> 실행 -> 리뷰 -> 검증 -> 기록까지 끝까지 밀어붙이는 장시간 작업 실행기**다.

사용자는 매번 세부 스킬을 직접 고를 필요가 없다. 큰 작업이면 `/moonshot-phase-runner`로 시작하고, 나머지 내부 스킬과 스크립트는 phase runner가 연결한다.

## 언제 쓰나

다음 중 하나라도 해당하면 phase runner가 기본값이다.

- 기능이 여러 파일, 여러 화면, API, 데이터 흐름에 걸친다.
- 작업이 한 번의 짧은 수정으로 끝나지 않는다.
- 구현 계획을 phase 단위로 관리해야 한다.
- 중간에 세션이 끊겨도 이어서 할 수 있어야 한다.
- “끝까지 계속 진행”, “전체 plan 완료까지”, “phase 기반으로 실행” 같은 요청이다.
- 완료 주장 전에 리뷰, 테스트, QA, handoff 증거가 필요하다.

반대로 아주 작은 오타 수정, 단일 파일의 명확한 버그 수정은 phase runner까지 탈 필요가 없다.

## 사용자가 입력하는 명령

가장 일반적인 사용:

```text
/moonshot-phase-runner
```

계획 디렉터리를 지정:

```text
/moonshot-phase-runner docs/implementation
```

질문 없이 자율 실행:

```text
/moonshot-phase-runner docs/implementation --autonomous
```

준비만 하고 실행은 멈춤:

```text
/moonshot-phase-runner docs/implementation --prepare-only
```

현재 세션이 직접 조율:

```text
/moonshot-phase-runner docs/implementation --execution-mode in-session-coordinator
```

기본 기대값은 `--prepare-only`가 아니다. 사용자가 “계속”, “진행”, “실행”이라고 말하면 준비 후 바로 실행까지 들어간다.

## 전체 흐름

```text
사용자 요청
  -> 1. Plan Directory 결정
  -> 2. Master Plan / Phase 문서 확인
  -> 3. phase-status.yaml 생성 또는 갱신
  -> 4. phase별 실행 아티팩트 준비
  -> 5. 불확실성 확인 또는 autonomous 처리
  -> 6. 실행 모드 결정
  -> 7. phase 실행 루프 시작
  -> 8. 각 phase에서 구현, 리뷰, 검증, 기록 반복
  -> 9. 모든 actionable phase 완료 또는 명시적 중단 사유 기록
```

핵심은 **phase 하나 끝났다고 반환하지 않는 것**이다. 기본 실행에서는 활성 plan directory 안에 남은 phase가 있으면 계속 다음 phase로 넘어간다.

## 1. Plan Directory 결정

phase runner는 먼저 “어떤 계획을 실행할지”를 찾는다.

우선순위:

1. 사용자가 넘긴 `<plan-dir>`를 사용한다.
2. `.claude/docs/phase-status.yaml`에 기존 active plan이 있으면 재사용한다.
3. `docs/implementation`에 유효한 master plan과 phase 문서가 있으면 재사용한다.
4. 안전한 후보가 하나뿐이면 그 후보를 사용한다.
5. 없으면 `moonshot-plan-writer`로 `docs/implementation`을 만든다.

안전 규칙:

- 후보가 여러 개고 무엇을 써야 할지 명확하지 않으면 추측하지 않는다.
- 이 경우 사용자에게 어느 plan directory를 쓸지 물어야 한다.

## 2. Plan 문서 확인

필요한 기본 구조:

```text
docs/implementation/
  00-master-plan-v1.md
  01-...md
  02-...md
  03-...md
```

`00-master-plan-*`는 전체 목표와 phase 목록을 담는다.  
각 phase 문서는 해당 단계에서 실제로 무엇을 끝내야 하는지 담는다.

완료된 phase 문서는 `<plan-dir>/close/`로 이동될 수 있다. `close/` 아래 문서는 이력이며, 다음 실행 대상이 아니다.

## 3. phase-status.yaml 생성

phase runner는 실행 상태를 `.claude/docs/phase-status.yaml`에 기록한다.

여기에는 다음 정보가 들어간다.

- 어떤 master plan을 실행 중인지
- execution mode가 무엇인지
- phase별 상태가 `pending`, `in_progress`, `completed`, `failed` 중 무엇인지
- 시도 횟수와 마지막 결과
- phase별 `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md` 위치

사용자 관점에서 이 파일은 **현재 어디까지 왔는지 보는 상태판**이다.

## 4. 실행 아티팩트 준비

각 phase마다 실행용 폴더가 생긴다.

예시:

```text
docs/implementation/execution/01-project-setup/
  SPRINT_CONTRACT.md
  QA_REPORT.md
  HANDOFF.md
  SCORECARD.md
```

각 파일의 역할:

| 파일 | 역할 |
| --- | --- |
| `SPRINT_CONTRACT.md` | 이번 phase에서 무엇을 할지, 무엇은 안 할지, 어떤 기준으로 통과할지 정의 |
| `QA_REPORT.md` | 검증 결과, 실패 조건, 다음 경로를 기록 |
| `HANDOFF.md` | 중단/재개를 위한 현재 상태와 다음 작업 기록 |
| `SCORECARD.md` | 객관식에 가까운 체크리스트와 점수 기반 완료 판단 |

이 아티팩트들은 장식 문서가 아니다. 다음 attempt는 이 파일들을 입력으로 삼아 이어진다.

## 5. 불확실성 처리

기본 모드에서는 phase 문서를 보고 불확실한 요구사항이 있으면 질문할 수 있다.

예:

- 이 phase에서 UI까지 포함하는가?
- 외부 API 연동은 mock인가 실제인가?
- 검증 기준은 build 통과인가 browser flow 통과인가?

`--autonomous`를 붙이면 질문 없이 현재 문서 기준으로 진행한다. 이 경우 phase runner는 모호함을 reasonable assumption으로 처리하고 실행한다.

## 6. 실행 모드 결정

실행 모드는 크게 두 가지다.

### delegated-terminal

기본에 가까운 장시간 자율 실행 모드다.

내부적으로:

- `moonshot-phase-executor`
- `moonshot-phase-dispatch.mjs`
- `agent-loop.mjs`

경로를 타고, 실제 루프가 계속 돈다.

사용자 기대:

- “계속 진행해” 같은 요청에 가장 적합하다.
- phase 하나 끝났다고 멈추지 않는다.
- loop가 종료될 때까지 중간 보고는 진행 상황으로만 다룬다.

### in-session-coordinator

현재 대화 세션이 조율자 역할을 하는 모드다.

특징:

- 각 attempt는 fresh fork/sub-agent처럼 격리되어야 한다.
- 메인 세션은 세부 구현 잡담을 들고 가지 않는다.
- 각 attempt 결과는 요약만 합쳐진다.

사용자 기대:

- 중간에 판단을 자주 확인하고 싶을 때 쓴다.
- 완전 자율 장시간 실행력은 `delegated-terminal`보다 약할 수 있다.

## 7. phase 내부 실행 순서

각 phase 안에서는 다음 stage가 기본 순서다.

```text
ready/isolate
  -> execute
  -> review
  -> verify
  -> finish/handoff
```

### ready/isolate

실행 전에 최소 조건을 확인한다.

- 프로젝트 계약이 있는가?
- 필요한 context가 있는가?
- 검증 계약이 있는가?
- 격리된 작업 공간 또는 worktree가 필요한가?

관련 스킬:

- `pre-flight-check`
- `project-contract-gate`
- `context-readiness-gate`
- `verification-contract-gate`
- `workspace-isolation-gate`

### execute

실제 구현 단계다.

관련 스킬:

- `karpathy-execution-gate`
- `test-driven-development`
- `implementation-runner`
- `code-simplifier`
- `build-error-resolver`
- `failure-analyzer`

원칙:

- 구현 전 plan을 비판적으로 확인한다.
- 동작 변경이면 테스트 또는 재현 기준을 먼저 잡는다.
- 실패하면 바로 땜질하지 않고 root cause를 기록한다.

### review

구현자가 스스로 완료 선언하지 못하게 별도 리뷰 단계를 둔다.

관련 스킬:

- `codex-review-code`
- `security-reviewer`
- `audit`
- `web-design-guidelines`

중요 규칙:

- 코드 변경 phase는 review evidence 없이 `clean_finish`로 갈 수 없다.
- 리뷰가 아직 `no`인데 `QA_REPORT.md`가 완료라고 말하면 계약 위반이다.

### verify

실제 검증 증거를 만든다.

관련 스킬:

- `browser-verifier`
- `qa-flow`
- `completion-verifier`
- `verification-evidence-gate`

검증 예:

- typecheck
- build
- lint
- unit/integration/e2e
- browser flow
- 수동 QA 체크리스트

완료 주장은 fresh evidence 뒤에만 가능하다.

### finish/handoff

phase 종료 또는 다음 attempt를 위한 기록 단계다.

관련 스킬:

- `doc-auto-sync`
- `session-logger`
- `commit-moonshot`은 사용자가 명시적으로 원할 때만

결과는 세 가지 중 하나여야 한다.

| 결과 | 의미 |
| --- | --- |
| `clean_finish` | 검증 통과, 리뷰 완료, 남은 범위 없음 |
| `retry` | 실패가 있지만 고칠 수 있으므로 다음 attempt로 이동 |
| `resume_later` | 지금은 멈춰야 하며 handoff로 재개 가능하게 기록 |

## 멈출 수 있는 조건

정상적인 종료:

- active plan directory의 모든 actionable phase가 완료됨.
- 리뷰, 검증, finish closeout이 모두 일관됨.

정상적인 중단:

- 사용자가 명시적으로 멈추라고 함.
- retry limit 또는 hard blocker에 도달함.
- 필요한 입력이 없고 추측하면 위험함.
- runtime 자체가 계속 실행할 수 없는 상태가 됨.

멈추면 안 되는 조건:

- phase 하나가 끝남.
- `QA_REPORT.md`만 갱신됨.
- `HANDOFF.md`만 작성됨.
- 체크포인트에 도달함.
- 문서가 최신화됨.
- 부분 구현이 됨.

이것들은 진행 상황이지 종료 사유가 아니다.

## 사용자가 보는 주요 산출물

| 산출물 | 보면 알 수 있는 것 |
| --- | --- |
| `.claude/docs/phase-status.yaml` | 전체 phase 진행 상태 |
| `<plan-dir>/00-master-plan-*.md` | 전체 목표와 phase 구성 |
| `<plan-dir>/<phase>.md` | phase별 작업 정의 |
| `<plan-dir>/execution/<phase>/SPRINT_CONTRACT.md` | 이번 round의 계약 |
| `<plan-dir>/execution/<phase>/QA_REPORT.md` | 검증 결과와 다음 경로 |
| `<plan-dir>/execution/<phase>/HANDOFF.md` | 중단/재개 상태 |
| `<plan-dir>/execution/<phase>/SCORECARD.md` | 완료 점수와 unmet item |
| `.claude/logs/agent-loop/` | delegated-terminal 실행 로그 |

## 사용자가 할 일

사용자는 보통 세 가지만 하면 된다.

1. 큰 작업을 phase runner로 시작한다.
2. 질문이 나오면 요구사항을 답한다.
3. 중단/완료 보고를 받을 때 `phase-status.yaml`, `QA_REPORT.md`, `HANDOFF.md` 기준으로 상태를 확인한다.

스킬을 직접 줄줄이 고를 필요는 없다. `moonshot-phase-runner`가 public entrypoint이고, `moonshot-phase-executor`, dispatcher, agent-loop는 내부 실행 경계다.

## 좋은 요청 예시

```text
/moonshot-phase-runner docs/implementation --autonomous
전체 phase 완료까지 계속 진행해. phase 하나 끝났다고 멈추지 말고, blocker가 있으면 QA_REPORT와 HANDOFF에 이유를 남겨줘.
```

```text
/moonshot-phase-runner
현재 저장소 상태를 보고 안전한 plan directory를 찾고, 없으면 docs/implementation을 만들어서 실행까지 이어가.
```

```text
/moonshot-phase-runner docs/implementation --prepare-only
실행은 아직 하지 말고 phase-status와 execution artifact만 준비해줘.
```

## 흔한 오해

### “phase runner는 계획만 만드는 도구인가?”

아니다. 기본은 준비 후 실행까지다. 계획만 원하면 `--prepare-only`를 명시해야 한다.

### “phase 하나 완료되면 사용자에게 final 보고하는가?”

아니다. 기본 auto-start run에서는 plan directory 전체가 실행 경계다. 남은 phase가 있으면 계속 간다.

### “QA_REPORT가 있으면 완료인가?”

아니다. QA_REPORT는 증거 중 하나다. review, verify, finish closeout이 일관되어야 완료다.

### “HANDOFF가 있으면 실패인가?”

아니다. HANDOFF는 재개 가능성을 위한 상태 파일이다. 다만 clean finish라면 HANDOFF도 clean-finish 상태를 반영해야 한다.

### “moonshot-phase-executor를 직접 호출해야 하나?”

보통 아니다. 사용자는 `moonshot-phase-runner`로 시작한다. executor와 scripts는 내부 adapter다.

## 한 문장으로 보는 설계 철학

Phase runner는 “AI에게 오래 맡기면 중간에 흐려진다”는 문제를 **phase 문서, sprint contract, QA report, handoff, scorecard, review/verification gate**로 통제하는 실행 하네스다.
