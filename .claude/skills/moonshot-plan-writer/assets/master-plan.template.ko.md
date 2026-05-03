# <프로젝트> 마스터 플랜 v<version>

> 이 문서는 모든 계획의 상위 계획입니다.

## 소스 기준선
- `<source-doc-1.md>` (역할: 범위/우선순위)
- `<source-doc-2.md>` (역할: 기술 계약)
- `<source-doc-3.md>` (역할: 경험/상호작용)

## 목표
- <전체 목표>

## Phase 인덱스
| Phase | 제목 | 계획 파일 | 선행 의존성 |
|------|------|-----------|-------------|
| 01 | <title> | `docs/implementation/01-<slug>-v<version>.md` | - |

## 실행 순서 메모
- <의존성 및 순서 메모>

## 병렬 실행 계획
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01, 02 | parallel | disjoint `ownedPaths`; shared mutable write 없음 |
| sequential | 03 | sequential | wave-1 완료 후 실행 |

- Phase-level 병렬 실행은 각 phase에 명시적인 `Phase Execution Metadata`가 있을 때만 허용합니다.
- 순차 phase는 암묵적 순서에 의존하지 말고 blocker 사유를 기록합니다.

## 소스 추적 매트릭스
| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|--------|---------------------|-------|-----------|--------|
| SRC-<n> | <source-name> | <summary> | <NN> | `docs/implementation/<NN>-<slug>-v<version>.md` | mapped |

## 매핑되지 않은 소스 요구사항
- <없음 또는 누락 사유>

## Phase 완료 체크리스트
- [ ] Phase 01 - <title> (`docs/implementation/01-<slug>-v<version>.md`)
- [ ] Phase 02 - <title> (`docs/implementation/02-<slug>-v<version>.md`)

## 완료 규칙
- 각 phase 계획의 완료 기준이 충족될 때만 체크합니다.
- 명시적 사유 없이 소스 요구사항을 누락하지 않습니다.
- 체크리스트가 모두 완료되기 전에는 전체 완료로 선언하지 않습니다.
