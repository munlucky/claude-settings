# Moon Relay Kernel Traceability Matrix

| Requirement | Decision | Phase | Owner | Primary Evidence | Verification Signal | Status |
|---|---|---|---|---|---|---|
| KRN-REQ-001 Relay/Kernel branch, runtime home, state, profile isolation | ADR-0001 | PH-01, PH-02 | kernel-product | product manifest, path policy, isolation fixtures | `node --test tests/kernel-track-isolation.test.mjs tests/kernel-runtime-home-isolation.test.mjs` | partial |
| KRN-REQ-002 single public entrypoint and internal capability catalog | Final Design §15 | PH-03 | kernel-router | skill catalog and router receipts | `node --test tests/kernel-entrypoint-contract.test.mjs tests/kernel-skill-catalog.test.mjs` | partial |
| KRN-REQ-003 adaptive FRAME→SHAPE→SLICE→SCHEDULE→EXECUTE→PROVE→CLOSE workflow | ADR-0003 | PH-03 | workflow-kernel | transition fixtures | `node --test tests/kernel-workflow-state-machine.test.mjs` | partial |
| KRN-REQ-004 five-layer stage-scoped context compiler with receipts | Final Design §11 | PH-03 | context-compiler | context receipts and redaction fixtures | `node --test tests/kernel-context-compiler.test.mjs tests/kernel-context-redaction.test.mjs` | partial |
| KRN-REQ-005 file intent / SQLite execution authority / one-way projection | ADR-0002 | PH-04 | state-authority | DB revision, projection hash, tamper fixtures | `node --test tests/kernel-state-authority.test.mjs tests/kernel-state-projection.test.mjs` | partial |
| KRN-REQ-006 T0~T3 risk-adaptive proof selection | ADR-0003 | PH-06 | proof-router | risk tier receipt | `node --test tests/kernel-proof-tier.test.mjs` | partial |
| KRN-REQ-007 E0~E2 conditional Evidence Pack | ADR-0003 | PH-04, PH-06 | evidence-packager | RUN_SUMMARY, QA_REPORT, RELEASE_EVIDENCE fixtures | `node --test tests/kernel-evidence-pack.test.mjs` | partial |
| KRN-REQ-008 minimal-correct-change derived skill | ADR-0004 | PH-05 | kernel-skills | failure baseline and skill A/B eval | `node --test tests/kernel-minimal-change-skill.test.mjs` | partial |
| KRN-REQ-009 domain modeling, tracer slicing, TDD, debugging, completion skills | Final Design §15 | PH-05 | kernel-skills | skill manifests, scenario evals | `node --test tests/kernel-core-skills.test.mjs` | partial |
| KRN-REQ-010 pinned upstream registry and no auto-apply | ADR-0004 | PH-05 | upstream-registry | registry, update proposal, checksum/eval receipt | `node --test tests/kernel-upstream-registry.test.mjs` | partial |
| KRN-REQ-011 sequential default and Safe Wave dry-run/limited parallelism | ADR-0004 | PH-06 | kernel-scheduler | DAG, conflict report, Wave receipt | `node --test tests/kernel-wave-planner.test.mjs tests/kernel-wave-conflict.test.mjs` | partial |
| KRN-REQ-012 Codex app Relay/Kernel project isolation | ADR-0001 | PH-07 | profile-builder | generated worktree profile fixtures | `npm run test:routing`; Kernel profile isolation tests | partial |
| KRN-REQ-013 Claude/Codex/Qwen profile parity without global mixed catalog | ADR-0001 | PH-07 | profile-builder | profile manifests and discovery reports | `npm run test:routing`; `npm run test:package` | partial |
| KRN-REQ-014 managed Node runtime and offline package reuse | Final Design §21 | PH-02 | package-runtime | runtime manifest, checksum, offline install fixtures | `npm run test:package`; managed runtime tests | partial |
| KRN-REQ-015 Relay DB is not automatically migrated or shared | ADR-0002 | PH-04 | state-authority | negative migration fixture | `node --test tests/kernel-no-relay-db-migration.test.mjs` | partial |
| KRN-REQ-016 untrusted-content, sandbox, write-set and approval boundaries | Final Design §18 | PH-03, PH-06 | sandbox-policy | deny fixtures and permission receipts | existing agent-policy/sandbox suites plus Kernel boundary tests | partial |
| KRN-REQ-017 A/B dogfood and promotion hard gates | Final Design §22 | PH-01, PH-07 | harness-lab | baseline/candidate comparison package | `npm run test:eval`; `npm run test:lab` | partial |
| KRN-REQ-018 uninstall/rollback must not damage the other track | ADR-0001 | PH-02, PH-07 | installer-profile | install/uninstall/rollback receipts | package/install isolation tests | partial |
| KRN-REQ-019 branch sync is security/runtime selective, not whole-workflow merge | Final Design §20 | PH-01, PH-07 | maintainers | sync policy and sample sync review | document contract test and review receipt | partial |
| KRN-REQ-020 completion requires fresh evidence and Kernel runtime decision | ADR-0002, ADR-0003 | PH-04, PH-06 | completion-authority | accepted/blocked completion fixtures | existing completion-authority suite plus Kernel tests | partial |

## Scenario Coverage

| Scenario | Requirements | Phase | Expected Result |
|---|---|---|---|
| KRN-SCN-001 Relay와 Kernel 동시 설치 | 001, 013, 018 | PH-02, PH-07 | runtime/profile/state path 교차 수정 0 |
| KRN-SCN-002 Codex 앱에서 Relay/Kernel 프로젝트 선택 | 001, 012, 013 | PH-07 | 현재 프로젝트의 스킬만 발견 |
| KRN-SCN-003 Relay 트랙에서 Kernel entrypoint 호출 | 001, 002 | PH-03 | `wrong_harness`로 실행 거부 |
| KRN-SCN-004 문서 오타 수정 | 006, 007 | PH-06 | T0/E0, 에이전트 리뷰 없음 |
| KRN-SCN-005 인증·DB schema 변경 | 006, 007, 016 | PH-06 | T3/E2, 조건부 security/architecture review |
| KRN-SCN-006 독립 write-set 두 슬라이스 | 011 | PH-06 | Wave eligible; v1에서는 dry-run, 이후 maxWorkers=2 |
| KRN-SCN-007 shared schema가 겹치는 슬라이스 | 011 | PH-06 | 순차 fallback |
| KRN-SCN-008 upstream skill update 발견 | 010 | PH-05 | proposal 생성, 자동 적용 없음 |
| KRN-SCN-009 세션 crash 후 재개 | 005, 020 | PH-04 | DB authority와 projection revision으로 resume |
| KRN-SCN-010 projection 수동 수정 | 005 | PH-04 | tamper/stale 경고, DB 역갱신 없음 |
| KRN-SCN-011 Relay DB가 존재하는 Kernel 최초 실행 | 005, 015 | PH-04 | 새 Kernel DB 생성, Relay DB 불변 |
| KRN-SCN-012 폐쇄망 package 설치 | 014, 018 | PH-02 | managed runtime checksum 검증 후 동작 |
| KRN-SCN-013 Kernel 제거 후 Relay 실행 | 001, 018 | PH-07 | Relay manifest/profile/state 불변 |
| KRN-SCN-014 false completion 시도 | 007, 020 | PH-04, PH-06 | fresh evidence/runtime decision 없으면 blocked |
