# 문서 추적 완료 하네스

> downstream 프로젝트에서 문서에 정의된 기능이 실제로 구현되고 검증되며 사람 UAT 직전 상태까지 밀어붙여야 할 때 사용하는 운영 가이드입니다.

## 목표

"문서에 있는 기능을 정말 다 만들었는가?"를 감각이 아니라 실행 아티팩트로 판정합니다.

이 하네스는 아래가 모두 충족될 때만 작업을 닫습니다.
- 이번 범위의 요구사항이 전부 추적됨
- 핵심 사용자 시나리오에 전부 증거가 있음
- 자동 검증 증거가 최신임
- 실행 상태가 `uat_ready` 임

반대로 `uat_complete` 는 자동화만으로 추론하지 않습니다.

## 필수 아티팩트

medium/complex `product_project` 작업에서는 아래를 기본 실행 아티팩트로 취급합니다.
- `SPRINT_CONTRACT.md`
- `QA_REPORT.md`
- `HANDOFF.md`
- `SCORECARD.md`
- `REQUIREMENTS_TRACEABILITY.md`
- `SCENARIO_MATRIX.md`
- `UAT_CHECKLIST.md`
- 작업 성격에 맞는 scorecard preset을 선택합니다: `generic`, `saas`, `api-backend`, `frontend`, `platform`
- traceability artifact 두 개가 모두 있으면 감지된 `REQ-*`, `SCN-*` 개수로 `REQ + SCN` 예산만 재배분합니다.

## 식별자 체계

안정적인 ID를 씁니다.
- `REQ-*`: 문서 요구사항
- `SCN-*`: 사용자에게 보이는 시나리오/여정
- `UAT-*`: 사람 검증이 필요한 수동 acceptance step

권장 매핑:
- `PRD.md`, `SPEC.md` 에서 `REQ-*` 를 뽑음
- `REQ-*` 는 plan/slice/task 와 연결
- 사용자 노출 요구사항은 하나 이상의 `SCN-*` 와 연결
- critical `SCN-*` 는 runtime/browser/E2E 증거와 연결

## 하네스 흐름

1. Planning
   - 제품 문서에서 `REQ-*` 추출
   - 각 요구사항에 slice owner 할당
   - 구현 전 critical `SCN-*` 확정
2. Contracting
   - `SPRINT_CONTRACT.md` 에 이번 라운드의 `REQ-*`, `SCN-*` 범위를 기록
   - finish 전에 필요한 증거를 명시
3. Execution
   - 이번 라운드 범위만 구현
   - 코드와 테스트가 들어올 때 추적 아티팩트 갱신
4. Verification
   - contract 정의 검증 실행
   - 변경된 critical scenario 는 runtime/E2E 증거 갱신
   - 누락 `REQ-*`, 증거 없는 `SCN-*` 는 `QA_REPORT.md` 에 남김
   - `SCORECARD.md` 에 객관 점수, 미충족 체크 수, verdict 갱신
   - 프로젝트 정책이 명시적으로 요구하지 않는 한 `VER` / `CLOSE` 가중치는 고정 유지
5. Finish 또는 Handoff
   - `uat_ready == true` 이고 `SCORECARD.md` 가 `done` 일 때만 finish
   - 열려 있는 요구사항/시나리오가 있으면 `HANDOFF.md` 로 넘김

## 완료 규칙

아래가 모두 참일 때만 `pass` 가 가능합니다.
- in-scope `REQ-*` 가 전부 `implemented` 또는 `verified`
- 검증 경로가 없는 요구사항이 없음
- 모든 critical `SCN-*` 에 fresh runtime 또는 E2E 증거가 있음
- contract required check 가 최신 증거와 함께 통과함
- `UAT_CHECKLIST.md` 에 `UAT Ready: yes` 가 기록됨
- `SCORECARD.md` 에 `Current score >= Target score`, `Unmet checklist items = 0`, `Blocking defects = 0`, `Verdict: done` 이 기록됨

`uat_complete` 는 사람 sign-off 가 추가로 필요합니다.
- Playwright, browser-verifier, 정적 review 만으로 추론하지 않습니다
- 담당자와 시각을 명시적으로 기록합니다

## 피해야 할 것

피해야 할 안티패턴:
- 브라우저 E2E 하나만으로 전체 커버리지를 대체하기
- ID 없는 요구사항 닫기
- 추적 아티팩트 없이 "문서 완료" 주장하기
- "나중에 수동 확인"을 증거처럼 취급하기
- generator 가 외부 evaluator 없이 자기 완료를 최종 선언하기

## 테스트 타입 분할 권장

- 핵심 사용자 여정은 E2E/browser
- 도메인 플로우와 API 경계는 integration
- 지역 분기와 edge case 는 unit
- 사람 판단이 필요한 항목만 manual UAT

이렇게 나눠야 런타임 증거를 유지하면서도 테스트 스위트가 유지 가능해집니다.
