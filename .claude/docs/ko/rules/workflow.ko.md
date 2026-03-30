# 작업 실행 방법

- 대화보다 실행을 우선합니다.
- 먼저 `workflowProfile` 과 `executionPlane` 을 결정합니다.
- `product_project` 는 구현 전에 project/context/verification gate 를 통과해야 합니다.
- 사람 승인 지점은 planning closeout 뿐이며, 실행이 시작된 뒤의 루프는 blocker 나 사용자 일시중지가 없으면 자율적으로 계속됩니다.
- 기본 흐름은 `intake -> plan -> ready/isolate -> execute -> review -> verify -> finish/handoff` 입니다.
- 완료 전에는 반드시 review 를 거칩니다. `meta_harness` 는 `strict` 를 사용하며, strict run 은 구현 전 `workspace-isolation-gate`, 완료 전 `verification-evidence-gate` 를 통과해야 합니다.
- 중간 이상 규모 작업이나 phase 작업은 `SPRINT_CONTRACT`, `QA_REPORT`, `HANDOFF` 를 유지해야 합니다.
- 체크포인트, 부분 성공, 환경 구성 완료, 마일스톤, 산출물 갱신, 진행 보고는 중단이나 완료 사유가 아닙니다.
- 명시된 완료 조건이 있으면 그 조건이 충족될 때까지 계속하고, 없으면 in-scope 작업이 남아 있고 실제 중단 사유가 없는 한 계속합니다.
- 중단은 실제 blocker, 필요한 사용자 결정, 파괴적 변경 확인, 명시적 사용자 중단/방향 전환일 때만 허용합니다.
- 비정상 중단 전에는 사용자 없이 가능한 다음 독립적 저위험 단계를 먼저 수행합니다.
- 비정상 중단 시 `QA_REPORT.md` 와 `HANDOFF.md` 에 중단 사유, 시도 내용, 자율 해결 실패 이유, 해소 후 즉시 다음 단계를 기록합니다.
- 시작 전에 IN/OUT scope 를 확인합니다. `.claude/rules/scope-confirmation.md` 참고.
- 정보가 부족하면 질문하거나 저위험 가정으로 진행합니다.
