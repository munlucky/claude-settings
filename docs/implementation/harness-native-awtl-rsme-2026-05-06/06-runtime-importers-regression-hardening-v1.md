# Phase 06: Runtime Importers and Regression Hardening (v1)

## 소스 매핑
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| AWTL-019 | Phase 5 | Codex/session and Claude transcript importer normalized schema | P06-1, P06-2 |
| AWTL-020 | Test Plan | importer backfill, memory boundary, regression contract 유지 | P06-3, P06-4 |

## 목표
- Codex rollout/session과 Claude Code transcript를 AWTL normalized event schema로 backfill하는 importer를 추가한다.
- imported event만으로 MemoryGraph promotion이 허용되지 않음을 전체 regression에서 확인한다.

## 기대 결과
- importer output은 `source_runtime_schema`, `import_confidence`, `imported_at`을 포함한다.
- importer가 만든 event는 canonical v1 schema에 맞지만, promotion gate에서는 imported-only blocker가 유지된다.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-3-importers"
  dependsOn:
    - "02-schema-trace-sink-foundation-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/awtl-runtime-importers.mjs"
    - ".claude/scripts/lib/awtl-runtime-importers.test.mjs"
    - ".claude/scripts/awtl-import-trace.mjs"
    - ".claude/docs/guidelines/awtl-rsme.md"
    - ".claude/docs/guidelines/awtl-rsme.ko.md"
    - ".claude/verification.contract.yaml"
    - ".claude/README.md"
    - ".claude/README.ko.md"
    - "README.md"
  readOnlyPaths:
    - ".claude/scripts/lib/awtl-event-schema.mjs"
    - ".claude/scripts/lib/awtl-trace-sink.mjs"
    - ".claude/scripts/lib/awtl-memory-promotion.mjs"
    - ".claude/scripts/meta-harness-trace.mjs"
  sharedMutablePaths:
    - ".claude/verification.contract.yaml"
    - "README.md"
  requiresManualEvidence: false
  mergePolicy: "conditional_parallel_then_sequential_closeout"
  parallelBlockers:
    - "Final docs/verification contract sync must run after all other phases complete."
```

## 범위
- 포함:
  - Codex rollout/session importer
  - Claude Code transcript importer
  - importer confidence and source schema metadata
  - final regression commands and docs sync
  - `meta-harness-trace` compatibility note
- 제외:
  - importer-only promotion
  - direct parsing of private reasoning/full raw prompts into stored events
  - SQLite WAL storage

## 선행조건과 입력
- 필수 문서:
  - `02-schema-trace-sink-foundation-v1.md`
  - final closeout should also read Phase 03-05 QA reports
- 필수 코드/데이터:
  - `.claude/scripts/lib/awtl-event-schema.mjs`
  - `.claude/scripts/lib/awtl-trace-sink.mjs`

## 상세 작업
| ID | 작업 | 단계 | 완료 기준 |
|---|---|---|---|
| P06-1 | Codex importer 구현 | 1. rollout/session input fixture 정의 2. normalized event 변환 3. import metadata 추가 | fixture output validates against `awtl.event.v1` |
| P06-2 | Claude transcript importer 구현 | 1. transcript fixture 정의 2. span/action approximation 3. confidence 산출 | low-confidence events are marked and not treated as native capture |
| P06-3 | Promotion bypass regression | 1. imported-only candidate fixture 생성 2. Phase 05 promotion gate 호출 3. blocker 확인 | imported-only candidate cannot be promoted |
| P06-4 | Final regression/docs sync | 1. verification contract에 AWTL checks 추가 여부 판단 2. README/guideline 링크 갱신 3. 전체 audit 실행 | knowledge audit, shell syntax, targeted node tests pass |

## 정확한 실행 대상
| ID | 생성 파일 | 수정 파일 | 테스트 파일 | 명령 | 예상 Fail/Pass Signal |
|---|---|---|---|---|---|
| P06-1 | `.claude/scripts/lib/awtl-runtime-importers.mjs`, `.claude/scripts/awtl-import-trace.mjs` | none | `.claude/scripts/lib/awtl-runtime-importers.test.mjs` | `node --test .claude/scripts/lib/awtl-runtime-importers.test.mjs` | Fail: imported event schema invalid. Pass: schema-valid normalized events |
| P06-2 | none | `.claude/scripts/lib/awtl-runtime-importers.mjs` | `.claude/scripts/lib/awtl-runtime-importers.test.mjs` | `node --test .claude/scripts/lib/awtl-runtime-importers.test.mjs` | Fail: no import confidence/source schema. Pass: metadata assertions pass |
| P06-3 | none | `.claude/scripts/lib/awtl-runtime-importers.test.mjs` | `.claude/scripts/lib/awtl-runtime-importers.test.mjs`, `.claude/scripts/lib/awtl-memory-promotion.test.mjs` | `node --test .claude/scripts/lib/awtl-runtime-importers.test.mjs .claude/scripts/lib/awtl-memory-promotion.test.mjs` | Fail: imported-only promotion allowed. Pass: blocked |
| P06-4 | none | `.claude/verification.contract.yaml`, `.claude/README.md`, `.claude/README.ko.md`, `README.md`, `.claude/docs/guidelines/awtl-rsme.md` | targeted AWTL tests | `bash .claude/scripts/knowledge-repo-audit.sh` | Fail: docs structure/audit error. Pass: audit exits 0 |

## Critical Product Scenarios
| Scenario | User-visible expectation | Command that proves it | Expected pass signal | Evidence path |
|---|---|---|---|---|
| SCN-P06-1 | Maintainer can backfill a runtime transcript into normalized AWTL events with import metadata | `node --test .claude/scripts/lib/awtl-runtime-importers.test.mjs` | importer fixture validates | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/06-runtime-importers-regression-hardening/QA_REPORT.md` |
| SCN-P06-2 | Imported event alone cannot promote a MemoryGraph fact | `node --test .claude/scripts/lib/awtl-runtime-importers.test.mjs .claude/scripts/lib/awtl-memory-promotion.test.mjs` | imported-only blocker assertion passes | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/06-runtime-importers-regression-hardening/QA_REPORT.md` |
| SCN-P06-3 | Existing phase runner and knowledge repository checks still pass after AWTL docs/scripts are added | `bash .claude/scripts/knowledge-repo-audit.sh` | audit exits 0 | `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/06-runtime-importers-regression-hardening/QA_REPORT.md` |

## Blockers And Review
- Blocker condition: available Codex/Claude transcript fixtures contain private reasoning or prompt bodies that cannot be safely represented even as redacted metadata.
- First review checkpoint: after importer fixture conversion passes but before docs advertise importer availability.
- Re-review trigger: any change that allows imported-only data to satisfy promotion gate.
- Verification evidence path: `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/06-runtime-importers-regression-hardening/QA_REPORT.md`

## 검증 계획
- [ ] Syntax: `node --check .claude/scripts/awtl-import-trace.mjs`
- [ ] Importer tests: `node --test .claude/scripts/lib/awtl-runtime-importers.test.mjs`
- [ ] Promotion regression: `node --test .claude/scripts/lib/awtl-memory-promotion.test.mjs`
- [ ] Shell syntax: `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/agent-loop.sh`
- [ ] Knowledge audit: `bash .claude/scripts/knowledge-repo-audit.sh`

## 완료 표시용 증거
- `docs/implementation/harness-native-awtl-rsme-2026-05-06/execution/06-runtime-importers-regression-hardening/QA_REPORT.md`
- final changed file list and targeted test output copied or linked in QA report

## 산출물
- `.claude/scripts/lib/awtl-runtime-importers.mjs`
- `.claude/scripts/awtl-import-trace.mjs`
- `.claude/scripts/lib/awtl-runtime-importers.test.mjs`
- docs/verification contract updates as needed

## Phase 완료 체크리스트
- [ ] Codex/session importer emits schema-valid imported events
- [ ] Claude transcript importer emits schema-valid imported events
- [ ] imported-only events cannot bypass promotion gate
- [ ] final docs and verification contract audit pass

## 핸드오프 메모
- At final closeout, update `00-master-plan-v1.md` checkboxes only after Phase 01-06 QA evidence exists.
