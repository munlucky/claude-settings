# Moon Relay Kernel

Date: 2026-07-21  
Branch: `kernel/moon-relay-kernel`  
Status: architecture-approved / implementation-plan-ready

이 패키지는 기존 Moonshot Relay의 저수준 런타임·상태·권한·검증 자산을 선별적으로 재사용하면서, 공개 진입점·워크플로우·컨텍스트 엔지니어링·스킬 체계를 전면 재설계하는 **Moon Relay Kernel**의 최종 설계 및 구현 계획이다.

## 핵심 결정

- Kernel은 Relay의 경량판이 아니라 별도 제품 트랙이다.
- 같은 로컬 계정에 Relay와 Kernel을 동시에 설치할 수 있어야 한다.
- Kernel은 하나의 공개 진입점과 내부 capability 스킬로 구성한다.
- 실행 의도는 파일, 실행 사실·lease·완료 권한은 SQLite가 소유한다.
- 리뷰와 증거 생성은 작업 위험도에 따라 적응적으로 조정한다.
- 병렬 실행은 기본값이 아니며 안전성이 증명된 Wave에만 허용한다.
- 외부 스킬은 자동 동기화하지 않고 pin → diff → eval → 승인 절차를 사용한다.
- Codex 앱에서는 전역 프로필 전환이 아니라 Relay/Kernel 프로젝트·worktree 선택으로 하네스를 분리한다.

## 패키지 구성

- `MOON_RELAY_KERNEL_FINAL_DESIGN.md`: 최종 제품·아키텍처·운영 설계
- `TRACEABILITY_MATRIX.md`: 요구사항-결정-단계-증거 연결
- `SPEC_TEST_OBLIGATIONS.md`: 요구사항·시나리오별 테스트 의무
- `ARCHITECTURE_REVIEW.md`: 설계 검토 및 채택/기각 결론
- `ARCHITECTURE_HANDOFF.json`: phase runner용 아키텍처 핸드오프
- `ADR/`: 핵심 아키텍처 결정
- `00-master-plan-v1.ko.md`: 구현 마스터 플랜
- `01-*.ko.md` ~ `07-*.ko.md`: 단계별 구현 작업 문서
- `planning-loop/plan-quality-review-iter-01.yaml`: 독립 리뷰 반영 기록

## 실행 경계

이 패키지는 구현 명령을 승인하는 설계·계획 패키지다. 문서 존재 자체는 구현 완료 증거가 아니다. 실제 완료 판정은 각 단계가 요구하는 fresh verification 결과와 Kernel runtime-state completion authority가 소유한다.

초기 단계에서는 `.claude/**`, `.codex/**`, 계정 루트 설치 프로필을 직접 변경하지 않는다. 소스·패키지 계약과 격리 테스트가 통과한 뒤 별도 adoption 단계에서만 활성화한다.
