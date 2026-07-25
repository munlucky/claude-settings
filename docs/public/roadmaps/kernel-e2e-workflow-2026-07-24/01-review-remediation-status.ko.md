# Kernel E2E 워크플로우 — 외부 리뷰 대응 결과 및 잔여 개선사항

**문서 상태:** Remediation Report
**기준 리뷰:** `REQUEST_CHANGES` (머지 커밋 `8a16200e` 대상)
**기준일:** 2026-07-25 (자동 리뷰 대응 반영)
**전략 baseline:** `00-final-strategy.ko.md`
**검증 기록:** 저장소 루트 `QA_REPORT.md` (2026-07-25 항목)

---

# 1. 요약

리뷰가 차단 사유로 든 P0 7건과 P1 6건을 모두 처리했다.

리뷰의 핵심 진단은 "기능 모듈은 존재하지만 `next`/`report` E2E 경로에 결합되지 않았다"였고, 더 심각한 지적은 "obligation과 evidence 사이에 권위 있는 binding이 없어 false completion 방어에 우회 경로가 있다"였다. 두 가지 모두 해소했다.

| 영역 | 리뷰 판정 | 현재 |
| --- | --- | --- |
| 최신 모델을 위한 프롬프트 단순성 | 통과 | 유지 (공개 스킬 1개, 모델 가시 명령 2개) |
| 런타임 Proof Executor | 부분 통과 | Node 전용 탈피, 명령 결합 추가 |
| Workspace identity·freshness | 통과에 가까움 | 변경 없음 |
| 단일 요청 E2E 실행 | 미완성 | Host bootstrap으로 해소 |
| 완료 권위·false completion 방어 | **중요 우회 경로 존재** | obligation 단위 판정으로 폐쇄 |
| 재개·동시성 | CLI 경로 결함 | lease 재설계로 해소 |
| Greenfield/Brownfield 자동화 | 모듈은 있으나 미연결 | `next` action에 결합 |
| P2/P3 선택 기능 | 대부분 API 수준 | route·capability·stage context 결합 |

승격 상태 권고는 리뷰와 동일하게 유지한다. `experimental` / 통제된 dogfood는 가능하고, `preview` 이상은 아래 5장의 이월 사항 때문에 아직 이르다.

---

# 2. P0 — 차단 결함 대응

## P0-1. 공개된 두 명령만으로 Run을 시작할 수 없음

`ensureRun({ runId, objective, taskContract })`를 Control Plane에 추가했다. 최초 호출이면 생성하고 이후에는 재개하는 멱등 계약이다. CLI는 `kernel next <run-id> --contract-json <file>`로 이를 호출한다.

모델 가시 명령은 여전히 `next`와 `report` 두 개다. 사용자에게 별도 `begin`을 요구하지 않는다는 리뷰의 제약을 지켰다.

## P0-2. Obligation 이름을 모델이 임의로 붙일 수 있음

두 단계로 막았다.

1. `scripts/kernel/proof/command-catalog.mjs` — 프로젝트가 **스스로 선언한** 명령만 발견한다. npm/pnpm/yarn 스크립트, Makefile 타겟, go/cargo/python/maven/gradle 매니페스트의 표준 태스크 명령. 각 명령에 의미 클래스(`unit-test`, `static-analysis`, `e2e`, `build`, `script`)를 부여한다.
2. `scripts/kernel/run/obligation-compiler.mjs` — Run 시작 시 obligation별 `allowedCommandRefs`를 고정한다. `kernel/proof-policy.yaml`의 `obligations` 섹션이 권위다.

`report`는 결합되지 않은 명령을 **실행하기 전에** 거부한다(`evidence-rejected`).

```
report status: evidence-rejected
failure: Command "noop" is not bound to obligation "unit-test" (allowed: test:ok)
```

명령 이름은 프로젝트가 작성하므로 보고하는 모델이 위조할 수 없다. 이것이 이 결합이 성립하는 근거다.

## P0-3. Hard evidence와 judgment obligation이 DB 모델에서 미구분

`run_obligations`에 `evidence_class`, `verification_method`, `allowed_command_refs`, `acceptance_ids`, `protected`, `contract_revision`을 추가했다. `verifications`에 `evidence_class`, `contract_revision`을 추가했다.

완료 판정을 Run 전체 단위에서 **obligation 단위**로 바꿨고, 클래스 간 대체를 금지했다.

- `hard` obligation → 커널이 실행한 명령만 인정
- `judgment` obligation → 구조화된 verdict만 인정
- 서로 대체 불가

workspace를 변경한 Run은 `hard`가 커널 실행으로만 충족되도록 더 조인다. 변경이 없는 Run에 한해 attested 증거를 인정하되, judgment는 어느 경우에도 executable obligation을 채울 수 없다.

protected judgment obligation은 `reviewerId`와 `rationale`을 요구하고, T3에서는 implementer와 다른 reviewer를 요구한다.

## P0-4. Task Contract가 보존되지 않아 resume가 비결정적

`runs.task_contract_json`, `runs.contract_revision`을 추가했다. `kernel next`는 objective·acceptance·constraints·nonGoals·risks를 SQLite만으로 반환한다.

추가로, 리뷰에 없던 결함을 대응 중 발견해 함께 고쳤다. **contract revision이 acceptance를 축소할 수 있었다.** 2턴째에 좁은 contract를 넘기면 `["A","B"]` → `["A"]`가 되고 완료 게이트는 줄어든 목록만 검사했다. `mergeContractRevision`으로 revision을 단조(monotonic)하게 바꿨다 — acceptance·constraints·nonGoals·risks·surfaces·flags는 정제와 추가만 가능하고 삭제는 불가하다. 기존 `ROUTE_DEMOTION_FORBIDDEN`과 같은 원칙이다.

## P0-5. Evidence Plan이 입력 검증에 그침

모든 acceptance를 `AC-n` id와 evidence plan을 가진 형태로 정규화하고(`scripts/kernel/task/task-contract.mjs`), obligation으로 컴파일한다. FRAME 이후 모델이 `report.evidencePlans`로 제출한 plan은 contract revision으로 저장되고 obligation을 재컴파일한다.

acceptance 커버리지는 AC id와 statement 양쪽으로 인정한다.

## P0-6. CLI multi-turn이 lease로 중단됨

holder를 PID 기반에서 **host session 기반**으로 바꿨다(`MOON_RELAY_KERNEL_SESSION_ID` 또는 `--session-id`, 미지정 시 프로젝트 기준 안정 식별자). lease에 단조 증가하는 fencing token을 추가했고, `report`는 짧은 TTL로 획득한 뒤 **명령 종료 시 해제**한다. finalize는 자신이 획득한 token을 여전히 보유한 러너만 수행할 수 있다.

이로써 다음 CLI 프로세스(다른 PID, 같은 세션)가 선행 프로세스가 버린 lease에 막히지 않는다. 살아 있는 다른 holder는 여전히 차단된다.

## P0-7. Partial finalization이 completed로 선언됨

`runs.finalization_status`를 completion decision과 분리했다. 모델 가시 `done`은 completion=accepted **이면서** finalization=completed일 때만 반환한다. 그 외에는 `report`가 `finalization-incomplete`를, `next`가 `finalize` action을 반환한다.

요청된 Git closeout은 재시도에서도 요청 상태로 유지된다. 재시도 시 closeout을 생략해 partial을 clean completion으로 바꾸는 우회를 막는다. 이미 커밋된 knowledge 트랜잭션은 재실행하지 않는다(revision CAS 실패로 실제 실패 원인이 가려지는 것을 방지).

---

# 3. P1 — 범용 E2E 대응

| 항목 | 대응 |
| --- | --- |
| P1-1 route·capability 미연결 | route(조건부 SHAPE 포함)를 `startRun`에서 확정·영속화하고 `report`가 최단 경로 대신 저장된 route를 따른다. 선언된 risk flag(`behaviorChanging`, `publicContract` 등)를 surface로 매핑해 proof tier resolver에 도달시켰다 |
| P1-2 stage context 미연결 | `next`가 Run의 **현재** stage 기준으로 knowledge context를 빌드하고 조건부 capability를 주입한다. 미충족 obligation마다 이를 증명할 수 있는 명령 목록을 함께 반환한다 |
| P1-3 Greenfield/Brownfield 미자동화 | `next`의 implement action에 repository evidence 또는 walking skeleton을 첨부하고, 변경 전 상태에서 baseline을 자동 포착한다. 내부 mode 분류는 여전히 모델에 노출하지 않는다 |
| P1-4 Node/npm 전용 | command catalog가 Make/Go/Cargo/Python/Maven/Gradle을 동일한 신뢰 경계로 처리한다 |
| P1-5 network sandbox 허위 선언 | firejail/bwrap/unshare의 구체 argv wrapper를 해석하고, 바이너리 존재와 플랫폼을 확인한 뒤 **실제로 적용**한다. 적용할 수 없으면 거짓 격리를 기록하는 대신 Run을 차단한다 |
| P1-6 Windows shell injection | 실행 파일을 직접 해석해 진짜 실행 파일은 shell 없이 실행한다. `.cmd`/`.bat` shim만 command processor를 쓰며 토큰별 인용과 이탈 문자 거부를 적용한다. 승인된 discovered command는 argv digest에 결합된다 |

---

# 4. 검증

- 신규 `tests/kernel-obligation-binding.test.mjs` 16케이스 — 각 P0/P1 메커니즘을 개별 검증한다. 결합 거부 시 명령이 실행되지 않는 것, contract revision이 축소되지 않는 것을 포함한다.
- Sentinel corpus 8 → 17케이스(`kernel-sentinel.v2`). 리뷰가 미포함이라고 지적한 우회 경로를 덮었다: obligation 이름 위조, judgment로 executable obligation 충족, T3에서 trivial hard + judgment 조합, partial finalization을 done으로 오판, network sandbox 허위 선언. 정상 경로 대조군도 추가했다: contract 보존 resume, 순차 CLI 프로세스, non-Node proof, host bootstrap.
- **false completion 0, missed accept 0.**
- `npm run test:kernel` 232/232.
- `npm test` 전체 직렬 게이트 811/812. 실패 1건(`browser flow missing runner ...`)은 기존 테스트 격리 flake다. 단독 실행 시 변경 전후 모두 통과하고, 차이는 `.moonshot-relay/browser-artifacts/.../snapshot.json`의 mtime 하나뿐이며 이 경로는 `node --test`가 동시 실행하는 다른 9개 테스트 파일이 쓰고 커널 코드는 건드리지 않는다.

---

# 4-1. 자동 리뷰 대응 (커밋 `7dddf196`)

1차 대응 직후 자동 리뷰가 P1 5건을 제기했고 **전부 유효로 확인되어 수정했다.** 그중 3건은 4장에서 "닫았다"고 보고한 방어를 각각 다시 여는 것이었다.

| | 내용 | 성격 |
| --- | --- | --- |
| F1 | evidence plan의 `commandRefs`가 catalog 검증 없이 복사되어, `{class:'hard', method:'unit-test', commandRefs:['noop']}`가 no-op을 hard evidence로 결합 | **P0-2 방어를 P0-5 경로가 무력화** |
| F2 | `mergeContractRevision`이 id 기준 병합이라 `['A','B']` → `['C']`가 `['C','B']`가 되어 A 소멸 + A의 증거가 C의 커버리지로 오귀속 | **P0-4에서 고쳤다고 보고한 축소 결함이 미해결** |
| F3 | fallback holder가 같으면 동시 세션이 서로의 살아있는 lease를 탈취 | P0-6 트레이드오프의 부작용 |
| F4 | finalization 재시도가 `changedPaths`와 기존 commit SHA를 복원하지 않아, closeout이 `skipped`가 되고 finalization이 `completed`로 기록 | **P0-7이 막으려던 거짓 완료** |
| F5 | T3 독립성 검사가 `implementerId` 존재 시에만 동작 → 필드 누락으로 우회 | 게이트가 옵션 |

## 원인

공통 원인은 **테스트가 성공 경로와 편리한 실패 경로만 검증**한 것이다. 구체적으로,

- F2의 기존 테스트는 `['A','B']` → `['A']`라는 **접두사 케이스**만 봐서 위치 id가 우연히 맞아 통과했다
- F4의 기존 테스트는 실패 사유가 지속형(`approvalReceipt` 누락)이라 재시도도 같은 이유로 실패했다. **일시적 실패를 검증하지 않았다**

## 수정

- **F1** — plan의 command ref를 catalog와 method 계열에 대해 필터링한다. 미선언 ref와 계열 불일치 ref는 거부하고 오류 메시지에 이름을 명시한다. 계열 매칭은 정확 클래스가 아니라 **test / analysis 두 계열**로 한다. 이름 기반 분류는 `test:auth`(통합)와 단위 테스트를 구분할 수 없어 정확 매칭은 정직한 plan을 오탐하기 때문이다
- **F2** — 병합 키를 id에서 **statement**로 바꿨다. 기존 문장은 제자리 정제, 새 문장은 새 id로 추가. 문구 수정은 교체가 아니라 추가가 되며, 이는 게이트를 줄일 수 없는 보수적 방향이다
- **F3** — lease에 `owner_pid`를 기록한다. holder가 같아도 **살아있는 다른 PID**가 보유 중이면 충돌로 처리하고, 프로세스가 종료된 holder는 획득 가능하게 두어 순차 CLI 호출은 막히지 않는다
- **F4** — `changedPaths`를 receipt에 영속화해 재시도에서 복원하고, 완료되지 않은 commit SHA는 Git receipt에서 회수한다. **요청된 closeout은 `completed`에 도달해야만** finalization이 완료된다
- **F5** — T3 protected judgment는 두 신원 모두 필수

## 검증

- `tests/kernel-obligation-binding.test.mjs` 16 → **21 케이스**
- Sentinel 17 → **21 케이스** (`kernel-sentinel.v3`) — `evidence_plan_names_noop`, `contract_revision_shrinks_acceptance`, `judgment_without_implementer`, `closeout_retry_loses_paths`
- false completion 0, missed accept 0
- `npm run test:kernel` **237/237**

---

# 5. 이월 — 감수하는 위험

## 5.1 실행된 적 없는 경로

win32 / Node 24에서만 실행했다. 이번 변경이 추가한 다음 세 경로는 **어디서도 실행된 적이 없다.**

1. Proof executor의 POSIX 분기 — Linux/macOS에서 커널을 처음 실행할 때 여기서 실패할 수 있다
2. Linux network sandbox wrapper — probe 주입으로만 검증했고 실제 자식 프로세스에 적용한 적 없다
3. non-Node 명령의 **실행** — make/go/cargo/python은 이 호스트에 없어 발견·결합까지만 검증했다(`SEN-103`이 그에 맞게 degrade한다)

GitHub required CI 구성(리뷰 P2-17)은 운영자 결정으로 **범위에서 제외**했다. 결과적으로 이 브랜치의 검증은 저장소 내부 자기 신고로 남는다. `experimental`·dogfood에는 무방하나 `preview` 이상 승격의 잔여 blocker다. Linux에서 `npm run test:kernel`을 한 번 실행하면 위 세 항목 중 대부분이 해소된다.

## 5.2 수용된 신뢰 경계 한계 (미완성 작업이 아님)

- **judgment obligation은 구조상 caller-attested다.** `reviewerId`/`implementerId`는 보고하는 caller가 주는 값이므로 T3 독립성 검사는 신원 증명이 아니라 구조적 요구사항이다. 권위 있게 만들려면 Host 발급 세션 신원(신뢰가 Host로 이동할 뿐)이나 커널의 리뷰어 모델 직접 호출(§5.1 "커널은 계획하고 Host가 실행한다, provider client 없음" 경계 파괴)이 필요하다. 커널 내부에서 검사만 강화하는 것은 보안 연극이다. 대신 커널이 보장하는 것은 **judgment가 executable obligation을 절대 채울 수 없다**는 것이며, 따라서 모든 tier의 모든 hard obligation은 여전히 커널 실행 명령을 요구한다.
- **명령 결합은 이름 기반이다.** 의미 클래스는 프로젝트가 작성한 이름에서 유도되므로 모델이 위조할 수 없지만, 아무 일도 하지 않는 `test` 스크립트를 선언한 프로젝트는 여전히 `unit-test`를 충족한다. 커널은 테스트가 의미 있는지 판단하지 않으며, 판단할 수도 없다. 보장하는 것은 그 명령이 프로젝트 선언이고, obligation에 결합됐고, 커널이 실제로 실행했다는 사실뿐이다.
- **`behaviorChanging`은 pass-through이며 추론하지 않는다.** 선언하지 않은 작업은 T0에 남는다. 추론하면 사실상 모든 작업의 하한이 T1이 된다. 미선언 행동 변경에 대한 방어는 대신 mutation 규칙이 맡는다 — workspace를 변경한 Run은 완료에 커널 실행 hard evidence를 요구한다.
- **`blocked`/`required` 네트워크 격리는 Linux 전용이다.** 다른 플랫폼에서는 기록 대신 거부한다. 정직한 결과지만 해당 플랫폼에서 정책을 쓸 수 없다.

---

# 6. 잔여 개선사항

## 6.1 리뷰 단계가 obligation에 연결되지 않음 (리뷰 P2-14) — 유일한 실제 게이트 구멍

T3 Run으로 확인한 현재 동작:

```
T3 required obligations : ["static-analysis","unit-test","security-review"]
reviewPlan says applies : ["contract","engineering"]
report status           : completed        ← 두 리뷰 단계 없이 완료
```

`resolveReviewPlan()`은 T2 이상·public contract면 contract review를, T1 이상·behavior change면 engineering review를 "적용된다"고 계산한다. 그러나 `startRun`이 이를 호출하지 않아 `review-contract`/`review-engineering`이 required obligation으로 선언되지 않는다. `recordReview`가 기록해도 미선언이라 `ad-hoc`이 되어 완료 게이트에 걸리지 않는다.

즉 §31 2단계 리뷰 정책이 현재 강제되지 않는다. 이는 리뷰가 다른 기능들에 대해 지적한 "모듈은 있으나 미연결"과 동일한 문제이며, route·capability·stage context·greenfield/brownfield는 이번에 결합했으나 이것만 남았다.

효과는 한정적임을 명시해 둔다. judgment obligation이므로 연결해도 보장되는 것은 "reviewer와 rationale이 붙은 구조화된 verdict를 반드시 제출해야 한다"까지이며 5.2의 한계는 그대로다. 그럼에도 "아예 요구하지 않음 → 반드시 제출"은 강제 함수로서 유의미하다.

작업량은 작다. `startRun`에서 `resolveReviewPlan`을 호출해 `review-*`를 `evidenceClass: judgment`(T3면 `protected`)로 선언하면 기존 컴파일러가 처리한다.

## 6.2 Sentinel corpus — 해소됨

리뷰가 요구한 20개 이상을 **21케이스로 충족**했다(`kernel-sentinel.v3`). 숫자를 채운 것이 아니라 자동 리뷰가 지적한 실제 우회 경로 4건을 트랩으로 추가한 결과다.

남은 후보(향후 추가 시):

- lease fencing token 추월 — 일시정지된 러너가 승계된 뒤 finalize 시도
- flaky waiver 경로 — waiver로 통과한 Run이 degraded로 기록되는지
- migration 에스컬레이션 — `analyzeMigration`이 T3로 올린 뒤 `migration-smoke` 없이 완료 시도

## 6.3 `state-store.mjs` 파일 크기 — 분할하지 않기로 판단

현재 1309줄이며 전역 코딩 규칙의 800줄 캡을 초과한다. 그러나 **줄 수를 맞추기 위한 분할은 커널 전략에 반한다.**

구성을 보면 지표가 잘못 재고 있음이 드러난다.

```
1309줄 = 선언적 DDL 224줄 + evaluateCompletion 159줄 + 메서드 61개(대부분 3~8줄)
BEGIN IMMEDIATE 트랜잭션 경계: 5곳
```

전체의 17%가 `CREATE TABLE` 선언이고, 나머지는 DB 하나에 대한 repository의 표면적이지 복잡도가 아니다.

전략적 근거는 다음과 같다.

- `promotion-policy.yaml`의 hardGate·qualityTarget 어디에도 코드 구조 지표가 없다. 분할은 승격 점수판을 움직이지 않는다.
- `minimal-correct-change` — 계약이 바뀌지 않는 순수 가독성 리팩터링은 회귀 표면만 늘린다.
- `reuse-before-new-code` — `knowledge-store`/`run-store` 같은 레이어 분할은 없던 경계를 발명하는 것이다.
- `state-policy.yaml`의 `executionAuthority: sqlite` — 이 파일은 DB 접근 유틸이 아니라 실행 권위 그 자체다. 트랜잭션 5곳이 한 파일에서 보이는 것이 그 역할에 맞는 형태이며, 모듈로 흩으면 트랜잭션 경계가 파일 경계를 넘어가 중첩 위험이 커진다.

다만 **`evaluateCompletion` 159줄만은 예외 후보**다. 이것은 저장이 아니라 정책이며, canonical principle `completion-requires-fresh-evidence`와 hardGate `falseCompletion: 0`의 유일한 구현이다. 읽기와 트랜잭션은 store에 남기고 판정만 순수 함수로 분리하면 `executionAuthority: sqlite`를 건드리지 않으면서 (a) DB 픽스처 없이 완료 판정을 단독 테스트할 수 있고 (b) hard gate 규칙 전체가 한 파일에서 읽힌다. 근거는 줄 수가 아니라 감사 가능성이다.

추출하더라도 약 1150줄로 캡을 초과한다. 이는 커널 정책에 근거 있는 예외로 기록하는 것이 맞다. 800줄 캡은 커널 canonical 정책이 아니라 전역 프로필의 코딩 규칙이며, `kernel/*.yaml`에는 파일 크기 정책이 없다.

**상태: 결정 대기.** 운영자 판단 사항이다.

## 6.4 Bounded wave Host execution receipt (리뷰 P2-15) — 실사용 후로 연기

`planBounded`는 Control Plane API로만 존재하고 `next`/`report`가 호출하지 않는다. 커널이 worker 수 상한·disjoint write set·slice별 검증을 계산해도 Host가 그 계획대로 실행했는지 확인하는 receipt가 없다.

다만 6.1과 성격이 다르다. 이것은 게이트 구멍이 아니라 아직 사용되지 않는 기능이다. 멀티 에이전트 fanout 실사용이 생기기 전에는 고쳐도 검증 대상이 없다.

---

# 7. 권고 순서

| 순위 | 항목 | 근거 |
| --- | --- | --- |
| 1 | 6.1 리뷰 obligation 연결 | 유일하게 선언된 정책이 강제되지 않는 지점 |
| 2 | 5.1 Linux에서 `test:kernel` 1회 실행 | 미실행 경로 3건 중 대부분 해소 |
| 3 | 6.3 `decideCompletion` 추출 | 운영자 결정 대기 |
| — | 6.4 Bounded wave receipt | 실사용 발생 후 |
