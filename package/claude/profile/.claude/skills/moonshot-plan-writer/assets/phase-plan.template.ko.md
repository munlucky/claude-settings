# Phase <NN>: <Title> (v<version>)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-<n> | <source-name> <section> | <summary> | <task linkage> |

## 목표
- <phase goal>

## 기대 결과
- <측정 가능한 결과>

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "<wave-slug>"
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - <이 phase가 생성 또는 수정할 수 있는 경로>
  readOnlyPaths:
    - <이 phase가 읽기만 할 경로>
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"

mvpMethodology:
  profile: "none | demo_first"
  sliceId: "<stable-slice-id>"
  maturityTarget: "demo_ready_ui | mock_functional_demo | demo_evidence_capture | user_demo_approval | real_functional | real_functional_verification | production_hardening"
  demoGate:
    required: true
    mode: hard_stop
    approvalSource: "docs/implementation/USER_DEMO_APPROVAL.md"
    evidenceSource: "docs/implementation/DEMO_EVIDENCE.md"
    mockContractSource: "docs/implementation/MOCK_API_CONTRACT.md"
    blocks:
      - real_functional
      - production_backend
      - real_persistence
      - auth_integration
      - irreversible_migration
```

- `ownedPaths`가 모호하거나 shared mutable 파일 수정 또는 manual evidence가 필요하면 `parallelEligible: false`로 두고 blocker를 기록합니다.
- user demo approval 전 Real Functional 작업을 막아야 하는 MVP slice에만 `mvpMethodology.profile: demo_first`를 사용합니다.

## 범위
- 포함:
  - <item>
- 제외:
  - <item>

## 선행조건과 입력
- 필수 문서:
  - `docs/implementation/00-master-plan-v<version>.md`
- `demo_first` profile인 경우 필수 문서:
  - `docs/implementation/MOCK_API_CONTRACT.md`
  - `docs/implementation/DEMO_EVIDENCE.md`
  - `docs/implementation/USER_DEMO_APPROVAL.md`
- 필수 코드/데이터:
  - <item>

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|----|------|------|-----------|
| P<NN>-1 | <task> | 1) <step> 2) <step> | <objective condition> |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|----|-----------|-----------|-------------|------|------------------------|
| P<NN>-1 | <paths or none> | <paths> | <paths> | `<command>` | <expected output / exit code> |

## Blockers And Review
- Blocker condition:
- First review checkpoint:
- Re-review trigger:
- Verification evidence path:

## 검증 계획
- [ ] 빌드/타입 체크: <command>
- [ ] 동작 확인: <what to verify>
- [ ] 회귀 확인: <what to verify>

## 완료 표시용 증거
- <test log path>
- <changed file list>
- <verification notes>
- `demo_first` profile인 경우 demo-first evidence:
  - Mock Functional Demo: mock success path와 mock error path evidence.
  - Demo Evidence Capture: demo run command와 tested route/flow evidence.
  - User Demo Approval: `USER_DEMO_APPROVAL.md`의 approved non-empty scope.
  - Real Functional: real API/persistence evidence와 `MOCK_API_CONTRACT.md` 대비 contract parity.

## 산출물
- <file/path or artifact>

## Phase 완료 체크리스트
- [ ] 모든 상세 작업이 완료 기준을 만족함
- [ ] 검증 체크를 통과함
- [ ] 산출물이 준비되고 리뷰됨
- [ ] 현재 maturity target에 해당하면 demo-first gate 충족

## 핸드오프 메모
- <notes for the next session/phase>
