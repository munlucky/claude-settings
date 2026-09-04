# Provenance method

## Decision

Capability Asset Base는 현재 checkout의 canonical path와 baseline main
commit 9701a86d2225c938f13982a7e0f7f43a7f9bc10e를 기준으로 작성한다.
과거 구현은 source snapshot을 복사하지 않고 full Git SHA와 그 commit에서
확인되는 path를 manifest에 기록한다.

## Generation model

- E0~E3은 Relay의 workflow, evidence, architecture, phase와 harness 계보를
  대표한다.
- E4~E8은 Kernel 도입, knowledge lifecycle, routing/optimization,
  execution-first 수렴을 대표한다.
- epoch는 subsystem 경계가 아니라 provenance anchor다. capability 하나가
  여러 epoch를 계승하거나 대체할 수 있다.

## Evidence rule

origin은 처음 관찰된 세대와 후속 generation을 기록하고,
implementations는 best-known current/historical path를 구분한다.
proof path는 실행 가능한 테스트 위치이며, 실제 실행 receipt를 문서가
위조하지 않는다. validator는 SHA 존재, commit:path 존재, current proof path
존재와 dependency를 다시 확인한다.

이 방법은 과거 코드를 재활성화하거나 migration을 수행하지 않는다.
