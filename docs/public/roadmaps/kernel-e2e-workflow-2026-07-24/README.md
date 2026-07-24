# Moonshot Relay Kernel E2E 개발 워크플로우 최종 개선 전략

Date: 2026-07-24
Branch: `main`
Status: Final / Implementation Baseline

이 패키지는 GPT-5.6·Fable 기반 Kernel 모드의 E2E 개발 워크플로우 최종 전략이다.
기존 v1, v2, v3 전략 문서(대화 산출물)를 대체하며, `moon-relay-kernel-2026-07-21`,
`kernel-project-knowledge-lifecycle-2026-07-23` 패키지 위에서 P0~P3 로드맵을 정의한다.

## 구성

- `00-final-strategy.ko.md`: 최종 전략 전문 (Implementation Baseline)

## 핵심 원칙

> 모델은 개발 문제를 해결하고, Kernel은 실행 신뢰 경계와 완료 권위를 관리한다.

## 구현 현황 (2026-07-24)

P0~P3 전 단계가 구현되고 검증되었다. 단계별 상세 변경 내역과 검증 증거는 저장소 루트
`QA_REPORT.md`의 Harness Change Ledger(2026-07-24 항목들)에 기록되어 있다.

| 단계 | 범위 | 상태 |
| --- | --- | --- |
| P0 | 신뢰 경계·Host 경계: `next`/`report`, 3-workspace identity, Trusted Proof Executor, 최소 E2E 루프, 계약 정합성, 측정 | 완료 |
| P1 | 재개 가능성·Brownfield: leases/attempts 연결·deterministic resume, Project Mode Detector, Evidence Scan·Baseline·failure classification, route escalation·flaky·discovered 승인, intervention 측정·sentinel set | 완료 |
| P2 | Greenfield·Knowledge·격리: walking skeleton, knowledge freshness·cheap re-verify·topology projection, network policy(inherited/blocked/required), migration workflow | 완료 |
| P3 | 선택적 품질: contract→engineering 2단계 review·independent reviewer, bounded multi-agent·safe wave, stagnation·replan·측정 기반 routing, evidence-plan gate | 완료 |

핵심 불변식: 공개 스킬 1개(`moon-relay-kernel`), 모델 가시 runtime command는 `next`/`report`
(복구용 `resume`), Kernel 코어에 provider client 없음, 소스 변경 Run은 kernel-runtime hard
evidence 필수, sentinel set에서 false completion 0.

## 실행 경계

이 패키지는 구현 명령을 승인하는 전략 베이스라인이다. 문서 존재 자체는 구현 완료 증거가
아니며, 완료 판정은 Kernel runtime hard evidence와 completion authority가 소유한다.
