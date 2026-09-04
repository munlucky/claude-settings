# Standalone architecture and research tools

- **ID**: `standalone-architecture-and-research-tools`
- **Domain**: `PRODUCTIVITY`
- **Family Status**: `OPTIONAL`
- **Summary**: architecture, product definition, research, diff, UI audit과 project-memory를 비런타임 도구로 제공한다.

## Subcapabilities (Decomplexification 단위)
- **`architecture-artifacts`** [`OPTIONAL`]: 아키텍처 설계 산출물 및 계약 시드 생성
- **`codebase-understanding`** [`OPTIONAL`]: 코드베이스 인덱스 구축 및 질의 인터페이스
- **`standalone-diff-and-audit`** [`OPTIONAL`]: 변경 설명 HTML 렌더링 및 UI 접근성 감사

## 해결하는 문제
- runtime 변경 전 architecture와 product fit을 검토할 별도 surface 부족
- research/diff/UI 분석 결과가 실행 boundary와 섞이는 문제

## 해결하지 않는 문제
- 실제 제품 구현과 배포
- standalone artifact만으로 Kernel acceptance를 충족하는 것

## 권장 사용
- architecture/product/research artifact를 implementation 전에 생성한다.
- standalone output은 source/evidence와 provenance를 함께 기록한다.

## 금지 사용
- standalone 계획을 구현 완료로 간주하지 않는다.
- artifact를 runtime loader나 completion gate에 자동 연결하지 않는다.

## 재도입 가이드
- **권장 레이어**: standalone planning/research artifact surface
- **트리거**: 구현 전 architecture, product, research 또는 UI/diff analysis가 필요할 때
- **통합 지점**:
  - artifact package
  - source/evidence provenance
  - explicit handoff
- **위험 요소**:
  - 계획과 구현의 혼동
  - 외부 자료 stale
  - advisory output 자동 promotion
- **안전 가드레일**:
  - explicit opt-in
  - citation/provenance
  - separate artifact ownership
  - Kernel binding required
