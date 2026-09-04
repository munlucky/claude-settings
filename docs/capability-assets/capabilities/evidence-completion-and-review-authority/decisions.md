# Decisions & Failure History: Evidence, completion, and review authority

- **Status**: `CORE`
- **Disposition**: `retain`

## Subcapabilities & Dispositions
- **`evidence-binding`** -> `CORE` (Workflow: true, Knowledge: false)
- **`verification-authority`** -> `CORE` (Workflow: true, Knowledge: false)
- **`completion-decision`** -> `CORE` (Workflow: true, Knowledge: true)
- **`protected-obligation`** -> `CORE` (Workflow: true, Knowledge: false)
- **`independent-reviewer-execution`** -> `OPTIONAL` (Workflow: true, Knowledge: false)
- **`review-transport`** -> `HOST` (Workflow: true, Knowledge: false)

## 설계 및 보존 결정
신뢰 가능한 agent workflow의 핵심 completion boundary이므로 CORE로 유지한다.

### 후속 조치
- 새 proof 방식은 evidence class와 freshness input을 먼저 정의한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E2 (`5ccf1c9ccfbf68ae8067d6e7e69a7555c782fdb5`, 2026-01-21)
- **Generations**:
  - **relay-tdd-completion** (E2, `5ccf1c9ccfbf68ae8067d6e7e69a7555c782fdb5`): TDD completion - 검증 명령과 완료 조건을 분리된 증거로 다루기 시작했다.
  - **relay-review-graph** (E3, `1f7ed38b80f2d66d34498548448423c56154be16`): Review graph - 독립 review, code graph와 closeout artifact를 연결했다.
  - **kernel-proof-plane** (E4, `7806dd1870501a1171969ca8e13af8fbec26f892`): Kernel proof plane - evidence pack과 release evidence schema를 Kernel 경계로 가져왔다.
  - **current-final-authority** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Final authority correction - fresh proof, completion gate와 finalization owner를 정리했다.

## 알려진 결함 및 교훈 (Known Failures)
### narrative-only-completion (P0)
- **현상**: 문서나 caller assertion만으로 runtime proof 없이 완료를 선언할 수 있었다.
- **원인**: completion projection과 proof execution의 권위가 분리되지 않았다.
- **교훈**: Kernel-recorded hard evidence와 fresh source identity를 completion gate의 필수 입력으로 둔다.
- **수정 커밋**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **회귀 테스트**: `tests/completion-authority.test.mjs`, `tests/completion-evidence.test.mjs`, `tests/kernel-proof-command-not-knowledge.test.mjs`
