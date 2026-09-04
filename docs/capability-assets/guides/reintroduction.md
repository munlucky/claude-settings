# Capability reintroduction guide

이 문서는 asset을 다시 구현하거나 연결할 때의 공통 순서다. 자산 문서는
재도입을 승인하지 않으며, 아래 조건을 만족하는 별도 task contract가
필요하다.

## 공통 순서

1. 해당 manifest의 problem, avoid_use, known_failures를 읽고 지금 문제가
   같은지 확인한다.
2. reintroduction.recommended_layer와 integration_points를 기준으로 새
   owner와 state/completion/evidence ownership을 설계한다.
3. historical implementation을 복사하지 말고 current canonical source와
   새 contract/schema를 작성한다.
4. unit proof, failure regression, 필요한 경우 host/provider receipt를
   먼저 만든다.
5. mutation scope와 migration/rollback boundary를 별도 승인받은 뒤에만
   runtime 또는 installer를 변경한다.

## Status별 gate

- CORE: current path와 executable proof를 유지하면서 contract-compatible
  변경만 허용한다.
- HOST: local tests만으로 live provider/installation을 주장하지 말고
  host-owned receipt를 수집한다.
- OPTIONAL: 명시적 opt-in과 artifact/authority 분리를 유지한다.
- LIBRARY: 자체 state/completion authority를 만들지 않는다.
- REFERENCE: 진단/비교 용도이며 adoption을 의미하지 않는다.
- DEPRECATED: archive path를 되살리지 말고 새 compatibility contract와
  isolated proof를 만든다.
- EXPERIMENTAL: open risk와 다음 검증 조건을 먼저 기록한다.

## 현재 baseline에서 금지된 재도입

Kernel Decomplexification, Relay runtime 복원, source snapshot 복사,
legacy loader/marketplace 구축, production workflow/provider/DB/
completion/knowledge lifecycle 변경은 이 Asset Base의 범위가 아니다.
