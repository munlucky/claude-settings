# Classification decisions

분류는 현재 통합 상태, owner, 실행 가능한 proof, 재사용 조건을 함께 본다.

| status | count | decision |
| --- | ---: | --- |
| CORE | 9 | 현재 Kernel의 bounded work, state, trust, knowledge, routing, optimization 경로 |
| HOST | 2 | package/profile/provider 경계. local contract proof와 host receipt를 구분 |
| OPTIONAL | 2 | standalone planning과 retrospective. 명시적 선택 및 review 필요 |
| LIBRARY | 0 | 현재 catalog에는 completion authority 없는 독립 library를 별도 asset으로 만들지 않음 |
| REFERENCE | 1 | harness surface 진단. 증거 범위를 관찰하지만 completion을 승인하지 않음 |
| DEPRECATED | 1 | Relay phase runner. predecessor와 실패 교훈만 archive에서 보존 |
| EXPERIMENTAL | 0 | 현재 baseline에서 계약과 provenance가 충분히 구조화되지 않은 항목은 승인하지 않음 |

agent_workflow와 project_knowledge_lifecycle relevance는 manifest와
catalog에 boolean으로 중복 기록한다. relevance는 adoption이나 runtime
loading을 뜻하지 않는다.

CORE가 아닌 항목을 CORE로 승격하려면 current integration, authority
boundary, executable proof와 known-failure review가 모두 필요하다.
