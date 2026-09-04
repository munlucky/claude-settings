# Capability Asset Base

이 디렉터리는 Moonshot Relay와 Moon Relay Kernel의 구현 역사를
Capability 단위로 보존하는 engineering index다. 단순 백업이 아니라
기능을 다시 도입할 때 문제, 세대, 계약, 증거, 실패, 현재 상태와
재도입 조건을 확인할 수 있는 provenance-bound asset base를 만든다.

## 기준선

| 항목 | 값 |
| --- | --- |
| schema version | 1 |
| repository | munlucky/moonshot-relay |
| baseline | main @ 9701a86d2225c938f13982a7e0f7f43a7f9bc10e |
| captured | 2026-09-04 |
| role | 비런타임 engineering index |
| decomplexification | 수행하지 않음 |

각 manifest는 가능한 경우 baseline의 조상인 full Git SHA와 검증된 경로를
가리킨다. Git commit은 immutable provenance reference이며 이 디렉터리에
과거 소스 snapshot을 복사하지 않는다.

## 경계

포함: Capability 목적과 문제, 권장·금지 사용, 세대별 provenance, 재사용
계약, 권위, test/fixture/smoke 증거, known failure, dependency,
현재 통합 상태, 분류, 재도입 가이드와 결정.

제외: production runtime, Kernel control plane, database, provider dispatch,
completion authority, knowledge lifecycle의 동작 변경, 소스 삭제·이동·복사,
기능 재도입, migration, rollout, commit/push.

이 문서는 runtime loader, installer, skill router에서 읽히지 않는다.
문서가 존재한다고 기능이 활성화되거나 CORE가 되지 않으며, canonical source와
Kernel의 실제 완료 권위가 이 인덱스보다 우선한다. 문서만으로 live evidence,
review receipt 또는 실행 proof를 대신하지 않는다.

## 레이아웃

docs/capability-assets/
  README.md                         운영 규칙
  catalog.yaml                      manifest 인덱스와 기준선
  taxonomy.yaml                     domain/status 계약
  epochs.yaml                       역사 세대와 Git anchor
  asset.schema.json                 asset.yaml 구조 계약
  decisions/                        경계와 분류 결정
  capabilities/<id>/asset.yaml      Capability manifest
  capabilities/<id>/README.md       사람용 재도입 요약
  capabilities/<id>/decisions.md    보존·통합·금지 근거

catalog.yaml은 목록과 상태만, 개별 manifest는 사실과 증거를 소유한다.

## Manifest 규칙

개별 manifest는 asset.schema.json을 따른다.

1. id는 소문자 kebab-case Capability 식별자다.
2. status는 CORE, HOST, OPTIONAL, LIBRARY, REFERENCE, DEPRECATED,
   EXPERIMENTAL 중 하나다. CORE는 현재 통합과 실행 가능한 proof가 있어야 한다.
3. origin.first_seen과 generation에는 실제 Git history의 full SHA를 쓴다.
4. best_known은 재도입 기준이지 현재 production 사용을 뜻하지 않는다.
5. authority의 state, completion, evidence ownership을 분리한다.
6. proof의 경로 목록과 실제 실행 receipt를 혼동하지 않는다.
7. known_failures에는 symptom뿐 아니라 root cause와 lesson을 남긴다.
8. decision에는 보존·통합·보류·금지 이유와 미수행 작업을 기록한다.

## 분류와 증거

domain은 WORK, TRUST, KNOWLEDGE, EXECUTION, INTELLIGENCE, OPTIMIZATION,
PRODUCTIVITY 중 하나다. status의 의미와 최소 증거는 taxonomy.yaml에 있다.

품질은 다음 연결이 닫혔는지로 판단한다.

manifest -> origin/generation -> implementation path -> contract/authority
-> test/fixture/smoke -> failure/current status -> reintroduction condition

Wave 8 validator는 schema, unique id, Git SHA, path, dependency와 status별
proof를 검사한다. validator가 추가되기 전에는 이 문서가 자동 검사를
대신하지 않는다. 최종 freeze에는 Relay-only, Kernel-only, inherited,
duplicate, no-proof 수와 미해결 항목을 숨김없이 기록한다.

## Wave 순서

Wave 0 framework 고정 → Wave 1 current inventory → Wave 2 Relay archaeology
→ Wave 3 Kernel archaeology → Wave 4 consolidation → Wave 5 proof/failure
binding → Wave 6 classification → Wave 7 reintroduction guide → Wave 8
validator와 baseline freeze.

모든 Wave는 이 인덱스와 명시된 비침습적 검증 도구에 한정한다.
decomplexification, runtime 변경, migration, 삭제는 별도 승인과 별도
작업이다.
