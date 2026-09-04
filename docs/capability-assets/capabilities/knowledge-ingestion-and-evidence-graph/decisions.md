# Decisions & Failure History: Knowledge ingestion and evidence graph

- **Status**: `CORE`
- **Disposition**: `retain`

## Subcapabilities & Dispositions
- **`knowledge-ingestion-normalization`** -> `CORE` (Workflow: true, Knowledge: true)
- **`ontology-gate-promotion`** -> `CORE` (Workflow: true, Knowledge: true)

## 설계 및 보존 결정
프로젝트 지식 lifecycle과 failure learning을 안전하게 연결하는 현재 CORE capability다.

### 후속 조치
- asset validator는 knowledge store에 접근하지 않고 manifest evidence만 검사한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E5 (`761a0d19dc8abdccd9d32469af79f0ec600d104f`, 2026-07-23)
- **Generations**:
  - **relay-knowledge-import** (E3, `1f7ed38b80f2d66d34498548448423c56154be16`): Relay knowledge import - 회고·trace를 knowledge record와 개선 candidate로 변환했다.
  - **kernel-knowledge-store** (E5, `761a0d19dc8abdccd9d32469af79f0ec600d104f`): Kernel knowledge store - knowledge record, evidence binding과 revision 저장 구조를 도입했다.
  - **ingestion-pipeline** (E7, `30b317c0c8f0dee9b4a1c8f82f8b14fe30a7f692`): Ingestion pipeline - redact, normalize, deduplicate, conflict와 transaction 단계를 분리했다.
  - **current-evidence-graph** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Evidence graph - candidate와 evidence/revision/ontology gate를 current Kernel lifecycle에 연결했다.

## 알려진 결함 및 교훈 (Known Failures)
### unreviewed-knowledge-promotion (P1)
- **현상**: 실패 signal이나 외부 문서가 review 없이 canonical knowledge로 승격될 수 있었다.
- **원인**: candidate, review, commit lifecycle이 단일 write로 축약되었다.
- **교훈**: candidate는 evidence와 review result를 갖기 전까지 advisory 상태로 유지한다.
- **수정 커밋**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **회귀 테스트**: `tests/kernel-knowledge-review.test.mjs`, `tests/kernel-knowledge-commit.test.mjs`, `tests/kernel-knowledge-candidate.test.mjs`
