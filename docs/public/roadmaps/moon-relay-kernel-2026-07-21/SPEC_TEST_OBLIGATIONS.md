# Moon Relay Kernel Spec-Test Obligations

모든 `KRN-REQ-*`와 UAT-critical `KRN-SCN-*`는 아래 obligation을 만족해야 한다. 행동 변경은 기본적으로 `tdd_red_green`, 기존 Relay 동작 보존은 `characterization_first`, 계정 루트·설치·프로필 채택은 `evidence_mandatory`를 사용한다.

| ID | Interface | Depth | Environment | Verification Mode | Required Evidence | Owner Phase |
|---|---|---|---|---|---|---|
| KRN-REQ-001 | cli/config | integration | local | tdd_red_green | track/runtime/profile isolation tests | 01,02 |
| KRN-REQ-002 | skill | component | hermetic | tdd_red_green | public catalog and wrong-harness tests | 03 |
| KRN-REQ-003 | workflow | integration | hermetic | tdd_red_green | transition matrix | 03 |
| KRN-REQ-004 | context | integration | hermetic | tdd_red_green | context receipt/redaction fixtures | 03 |
| KRN-REQ-005 | state | integration | local | characterization_first | DB authority/projection/tamper tests | 04 |
| KRN-REQ-006 | review | integration | hermetic | tdd_red_green | T0~T3 classification matrix | 06 |
| KRN-REQ-007 | artifact | integration | hermetic | tdd_red_green | E0~E2 fixture set | 04,06 |
| KRN-REQ-008 | skill | component | hermetic | tdd_red_green | minimality RED/GREEN eval | 05 |
| KRN-REQ-009 | skill | component | hermetic | tdd_red_green | core skill scenario eval | 05 |
| KRN-REQ-010 | cli/data | integration | local | tdd_red_green | pin/diff/proposal/no-auto-apply tests | 05 |
| KRN-REQ-011 | workflow | integration | local | tdd_red_green | DAG/write-set/conflict receipts | 06 |
| KRN-REQ-012 | ui/config | ui_integration | local | evidence_mandatory | Codex app project discovery report | 07 |
| KRN-REQ-013 | profile | integration | local | evidence_mandatory | provider profile parity matrix | 07 |
| KRN-REQ-014 | package/cli | broad_stack | local | characterization_first | Node 20/22/24 and offline package matrix | 02 |
| KRN-REQ-015 | state | integration | local | tdd_red_green | negative Relay DB migration test | 04 |
| KRN-REQ-016 | sandbox | integration | hermetic | characterization_first | deny/approval/write-set tests | 03,06 |
| KRN-REQ-017 | eval | broad_stack | docker/local | evidence_mandatory | Relay/Kernel A/B report | 01,07 |
| KRN-REQ-018 | installer | broad_stack | local | evidence_mandatory | install/uninstall/rollback matrix | 02,07 |
| KRN-REQ-019 | policy | component | hermetic | not_applicable | selective sync policy review | 01,07 |
| KRN-REQ-020 | completion | broad_stack | local | characterization_first | false completion negative tests | 04,06 |

## UAT-Critical Scenarios

| Scenario | Required Command or Check | Evidence Path | Expected Result |
|---|---|---|---|
| KRN-SCN-001 Relay/Kernel 동시 설치 | Kernel install matrix suite | `artifacts/kernel/phase-07/install-uninstall-matrix.json` | 교차 수정 0 |
| KRN-SCN-002 Codex 앱 프로젝트 선택 | profile discovery fixture + manual app check | `artifacts/kernel/phase-07/codex-app-project-report.json` | 해당 트랙 스킬만 노출 |
| KRN-SCN-003 wrong-harness 호출 | entrypoint contract test | `artifacts/kernel/phase-03/router-fixtures.json` | 실행·상태 변경 없이 거부 |
| KRN-SCN-004 문서 오타 | proof tier test | `artifacts/kernel/phase-06/risk-tier-matrix.json` | T0/E0 |
| KRN-SCN-005 인증·schema 변경 | proof tier test | `artifacts/kernel/phase-06/risk-tier-matrix.json` | T3/E2 |
| KRN-SCN-006 독립 write-set | wave planner test | `artifacts/kernel/phase-06/wave-dry-run.json` | eligible, v1 실행은 순차 |
| KRN-SCN-007 shared schema 충돌 | wave conflict test | `artifacts/kernel/phase-06/conflict-fixtures.json` | sequential fallback |
| KRN-SCN-008 upstream update | registry test | `artifacts/kernel/phase-05/upstream-registry-audit.json` | proposal만 생성 |
| KRN-SCN-009 crash resume | state authority test | `artifacts/kernel/phase-04/resume-report.json` | DB revision 기반 복구 |
| KRN-SCN-010 projection tamper | projection test | `artifacts/kernel/phase-04/projection-tamper-report.json` | DB 역갱신 없음 |
| KRN-SCN-011 Relay DB 존재 | no-migration test | `artifacts/kernel/phase-04/state-matrix.json` | Kernel 새 DB, Relay 불변 |
| KRN-SCN-012 폐쇄망 설치 | package/runtime suite | `artifacts/kernel/phase-02/install-matrix.json` | 외부 다운로드 없음 |
| KRN-SCN-013 Kernel 제거 후 Relay | install/uninstall suite | `artifacts/kernel/phase-07/install-uninstall-matrix.json` | Relay 정상 |
| KRN-SCN-014 false completion | completion proof test | `artifacts/kernel/phase-06/proof-receipts/false-completion.json` | blocked |

## Seam Rationale

- 제품·설치 경계는 단위 함수가 아니라 disposable HOME 전체 설치 흐름이 가장 높은 실용적 seam이다.
- 상태 권한은 projection 파일이 아니라 public runtime-state command/read model seam에서 검증한다.
- Codex 앱은 내부 UI 자동화보다 생성된 프로젝트/profile discovery와 실제 앱 smoke check를 결합한다.
- 스킬은 문구 snapshot이 아니라 실패 시나리오의 행동 결과를 seam으로 사용한다.

## Validator

구현 시 각 phase가 기계 판독 가능한 obligation rows를 생성하고 다음 검증을 통과해야 한다.

```bash
node scripts/spec-test-obligations.mjs validate --json
```