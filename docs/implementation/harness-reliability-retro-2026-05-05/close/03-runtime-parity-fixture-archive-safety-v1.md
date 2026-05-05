# Phase 03: Runtime Parity Fixture and Archive Safety (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HR-005 | ISSUE_REGISTER | runtime parity fixture side effect | temp copy 기반 smoke |
| HR-006 | ISSUE_REGISTER | archivedPhaseDoc pollution | archive sync 대상 제한 |
| HR-020 | ISSUE_REGISTER | active/close archive ambiguity | phase-status.yaml authoritative traversal |

## 목표
- runtime parity smoke가 `.claude/docs/runtime-parity-reference-plan` 원본과 `.claude/docs/phase-status.yaml`를 오염시키지 않도록 한다.
- archive sync는 실제 plan root의 completed phase만 대상으로 삼고 reference fixture 경로는 제외한다.
- active phase discovery는 root 파일 개수가 아니라 `phase-status.yaml` 상태를 우선한다.

## 기대 결과
- parity smoke 전후로 reference fixture hash가 동일하다.
- `archivedPhaseDoc`에 runtime parity reference fixture 경로가 들어가지 않는다.
- completed phase archive와 active candidate 계산이 close/ 이동 후에도 일관된다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2-parity-archive"
  dependsOn:
    - "01-capability-fingerprint-foundation-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/verify-phase-runtime-parity.mjs"
    - ".claude/scripts/verify-phase-runtime-parity.sh"
    - ".claude/scripts/verify-phase-runtime-parity-shell-core.sh"
    - ".claude/scripts/sync-phase-archive.py"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/docs/runtime-parity-reference-plan/"
  readOnlyPaths:
    - ".claude/scripts/agent-loop.sh"
    - ".claude/scripts/moonshot-phase-dispatch.sh"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## 범위
- 포함:
  - temp directory copy 기반 runtime parity smoke
  - source fixture hash/diff guard
  - archive sync include/exclude guard
  - phase-status authoritative traversal correction
- 제외:
  - retry suppression policy
  - artifact schema normalizer
  - Docker daemon gate

## 선행조건과 입력
- Phase 01 classifier naming을 사용한다.
- 기존 reference fixture:
  - `.claude/docs/runtime-parity-reference-plan/00-master-plan-v1.md`
  - `.claude/docs/runtime-parity-reference-plan/01-dispatch-smoke.md`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P03-1 | parity temp fixture 실행 | 1) temp dir 생성 2) reference fixture copy 3) smoke에 temp path 전달 4) temp artifact path 기록 | 원본 fixture hash unchanged |
| P03-2 | archive sync guard | 1) reference fixture path exclude 2) plan root allowlist 적용 3) archivedPhaseDoc validation 추가 | reference path pollution test 통과 |
| P03-3 | phase-status traversal correction | 1) total/planned/completed source를 phase-status로 통일 2) root/close fallback 순서 명시 | close/ 이동 후 active candidate가 drift하지 않음 |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P03-1 | 없음 | `.claude/scripts/verify-phase-runtime-parity.mjs`, `.claude/scripts/verify-phase-runtime-parity-shell-core.sh` | runtime parity fixture | `node .claude/scripts/verify-phase-runtime-parity.mjs --compact .claude/docs/runtime-parity-reference-plan` | `phase runtime parity smoke passed` 또는 environment blocker classified |
| P03-2 | 없음 | `.claude/scripts/sync-phase-archive.py` | archive pollution fixture | `python .claude/scripts/sync-phase-archive.py --help` | command loads without syntax/runtime path error |
| P03-3 | 없음 | `.claude/scripts/agent-loop-phase-state.mjs` | phase state fixture | `node --check .claude/scripts/agent-loop-phase-state.mjs` | exit code 0 |

## Critical Product Scenarios
| SCN ID | 사용자 기대 | 증명 명령 | Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-HR-005 | parity smoke가 reference fixture를 변경하지 않는다 | `node .claude/scripts/verify-phase-runtime-parity.mjs --compact .claude/docs/runtime-parity-reference-plan` | before/after hash unchanged | `.claude/logs/agent-loop/runtime-parity-fixture-hash.log` |
| SCN-HR-006 | completed archive만 close/로 이동한다 | `python .claude/scripts/sync-phase-archive.py --help` 이후 fixture test | reference fixture excluded | `.claude/logs/agent-loop/archive-sync-fixture.log` |

## Blockers And Review
- Blocker condition: parity smoke가 원본 fixture나 global phase-status를 쓰는 경로가 남으면 중단한다.
- First review checkpoint: temp copy path가 shell wrapper와 Node wrapper 양쪽에 전달되는지 확인한다.
- Re-review trigger: `sync-phase-archive.py`의 traversal 조건 변경 시 재리뷰한다.
- Verification evidence path: `.claude/logs/agent-loop/runtime-parity-fixture-hash.log`, `.claude/logs/agent-loop/archive-sync-fixture.log`

## 검증 계획
- [ ] Syntax: `node --check .claude/scripts/verify-phase-runtime-parity.mjs`
- [ ] Syntax: `python -m py_compile .claude/scripts/sync-phase-archive.py`
- [ ] Fixture smoke: runtime parity source hash unchanged
- [ ] Archive smoke: reference fixture path does not appear in `archivedPhaseDoc`

## 완료 표시용 증거
- before/after hash log
- archive sync fixture log
- updated parity wrapper behavior

## 산출물
- temp-copy parity smoke
- archive sync guard
- phase-status authoritative traversal behavior

## Phase 완료 체크리스트
- [ ] runtime parity smoke가 원본 fixture를 변경하지 않음
- [ ] archivedPhaseDoc pollution이 fixture로 방지됨
- [ ] close/ archive 후 active candidate 계산이 phase-status 기준으로 유지됨

## 핸드오프 메모
- Phase 06 regression suite에 이 phase의 fixture mutation test를 반드시 포함한다.
