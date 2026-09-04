# Decisions & Failure History: Project identity and knowledge lifecycle

- **Status**: `CORE`
- **Disposition**: `retain`

## Subcapabilities & Dispositions
- **`project-identity-binding`** -> `CORE` (Workflow: true, Knowledge: true)
- **`knowledge-lifecycle-authority`** -> `CORE` (Workflow: true, Knowledge: true)

## 설계 및 보존 결정
프로젝트 지식의 scope와 lifecycle을 보호하는 현재 CORE capability다.

### 후속 조치
- legacy namespace remediation은 자산화와 별도 승인 작업으로 유지한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E5 (`761a0d19dc8abdccd9d32469af79f0ec600d104f`, 2026-07-23)
- **Generations**:
  - **relay-knowledge-records** (E3, `1f7ed38b80f2d66d34498548448423c56154be16`): Relay knowledge records - 회고와 지식 기록을 workflow 보조 artifact로 보존했다.
  - **kernel-identity-lifecycle** (E5, `761a0d19dc8abdccd9d32469af79f0ec600d104f`): Kernel identity lifecycle - project identity, namespace, revision과 knowledge record lifecycle을 구조화했다.
  - **current-identity-preflight** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Identity preflight - legacy candidate와 canonical identity를 preflight로 분리했다.

## 알려진 결함 및 교훈 (Known Failures)
### legacy-identity-ambiguity (P1)
- **현상**: remote-derived legacy namespace가 canonical workspace와 같은 프로젝트인지 자동으로 확정할 수 없다.
- **원인**: 역사적 alias에는 persisted identity와 same-root evidence가 없을 수 있다.
- **교훈**: identity preflight를 fail-closed하고 명시적 remediation 없이 merge하지 않는다.
- **수정 커밋**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **회귀 테스트**: `tests/kernel-project-identity.test.mjs`, `tests/kernel-project-identity-review-remediation.test.mjs`
