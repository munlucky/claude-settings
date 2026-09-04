# Capability Decisions: Evidence, completion, and review authority

- **Capability ID**: `evidence-completion-and-review-authority`
- **Disposition**: `retain`
- **Subcapabilities Count**: 6

## Rationale
신뢰 가능한 agent workflow의 핵심 completion boundary이므로 CORE로 유지한다.

## Subcapabilities Allocation
- **Evidence binding** (`evidence-binding`): `CORE` — 실증 증거 수집 및 인수조건 의무 바인딩
  - Implementations: 4 files bound
  - Proofs: completion-evidence
- **Verification authority** (`verification-authority`): `CORE` — 검증 실행 결과 평가 및 통과 여부 단일 권위
  - Implementations: 5 files bound
  - Proofs: completion-evidence
- **Completion decision** (`completion-decision`): `CORE` — 최종 완료 판정 및 릴리즈 승인 게이트
  - Implementations: 1 files bound
  - Proofs: completion-evidence
- **Protected obligation** (`protected-obligation`): `CORE` — 고위험 변경에 대한 필수 검증 의무 강제
  - Implementations: 1 files bound
  - Proofs: kernel-evidence-pack
- **Independent reviewer execution** (`independent-reviewer-execution`): `OPTIONAL` — 독립 컨텍스트 리뷰어 실행 및 판정 도출
  - Implementations: 3 files bound
  - Proofs: review-receipt-completion
- **Review transport** (`review-transport`): `HOST` — 외부 리뷰어 세션 브릿지 및 프로토콜 전송
  - Implementations: 2 files bound
  - Proofs: review-receipt-completion

## Follow-up Directives
- 새 proof 방식은 evidence class와 freshness input을 먼저 정의한다.
