# Decisions & Failure History: Control plane state authority

- **Status**: `CORE`
- **Disposition**: `retain`

## 설계 및 보존 결정
Kernel이 Relay의 여러 orchestration surface를 대체하면서 보존해야 하는 핵심 authority capability다.

### 후속 조치
- 새 state field는 owner, persistence, projection과 completion impact를 함께 정의한다.

## 계보 및 세대 (Provenance)
- **First Seen**: E4 (`c93b6786c8ceb7a90f08d60f964d12f0b8b1cfa5`, 2026-07-22)
- **Generations**:
  - **kernel-policy-state** (E4, `7806dd1870501a1171969ca8e13af8fbec26f892`): Kernel state policy - state/workflow policy와 durable state store를 도입했다.
  - **kernel-control-plane** (E4, `c93b6786c8ceb7a90f08d60f964d12f0b8b1cfa5`): Control plane - run lifecycle, proof와 finalization을 조정하는 control plane을 추가했다.
  - **kernel-knowledge-control** (E5, `761a0d19dc8abdccd9d32469af79f0ec600d104f`): Knowledge-aware control - knowledge revision과 project identity를 lifecycle에 연결했다.
  - **execution-first-authority** (E8, `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`): Execution-first authority - owner-direct run, evidence, closeout과 finalization의 단일 권위를 확정했다.

## 알려진 결함 및 교훈 (Known Failures)
### projection-authority-confusion (P1)
- **현상**: read-model projection이나 legacy adapter state가 authoritative run state처럼 사용될 수 있었다.
- **원인**: source state, projection과 completion authority의 ownership이 중복되었다.
- **교훈**: control plane source state와 projection을 명시적으로 분리하고 transition receipt를 요구한다.
- **수정 커밋**: `9701a86d2225c938f13982a7e0f7f43a7f9bc10e`
- **회귀 테스트**: `tests/kernel-state-authority.test.mjs`, `tests/kernel-state-projection.test.mjs`, `tests/kernel-finalization-lifecycle.test.mjs`
