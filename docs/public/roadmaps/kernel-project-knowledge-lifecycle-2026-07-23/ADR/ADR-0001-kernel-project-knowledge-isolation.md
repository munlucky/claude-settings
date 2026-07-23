# ADR-0001: Kernel Project Knowledge Isolation

- Status: Accepted for implementation plan
- Date: 2026-07-23

## Context

Moon Relay Kernel은 Relay와 독립된 제품 트랙이며 runtime home, SQLite state, profile manifest, skill lock, cache, logs, completion state를 공유하지 않는다. 프로젝트 지식도 동일한 격리 원칙이 필요하다. Relay의 지식 저장소를 직접 공유하면 completion authority, schema evolution, uninstall, rollback, prompt contamination 경계가 다시 결합된다.

## Decision

Kernel은 다음 독립 namespace를 사용한다.

```text
~/.moon-relay-kernel/state/projects/<projectId>/knowledge/
```

- Kernel `projectId` resolver는 Relay 구현 패턴을 source reuse할 수 있지만 registry와 state는 Kernel home에 저장한다.
- Relay `~/.moonshot-relay/state/projects/**`, legacy `.claude/memorygraph/**`, Relay runtime DB를 읽거나 쓰지 않는다.
- Relay 지식 가져오기는 향후 별도 sanitize/export → validate/import 경로만 허용한다.
- 프로젝트 지식 파일은 portable typed JSONL, run-bound receipts/authority index는 Kernel SQLite를 사용한다.
- uninstall은 project knowledge를 기본 보존한다. purge는 별도 명시 승인과 manifest/receipt가 필요하다.

## Consequences

### Positive

- Relay/Kernel rollback과 schema evolution 독립
- 잘못된 완료·지식 승격의 상호 오염 방지
- 설치/제거/프로필 전환의 예측 가능성 향상
- 프로젝트별 revision과 provenance 추적 가능

### Negative

- 동일 프로젝트가 Relay와 Kernel에서 별도 지식 revision을 가질 수 있음
- 초기에는 중복 저장 비용이 발생
- 향후 명시적 export/import 도구가 필요

## Rejected Alternatives

1. Relay knowledge root 공유: 제품 격리 계약 위반
2. repository-local raw graph commit: 보안·용량·동시성·사용자 로컬 상태 문제
3. 모든 지식을 Kernel SQLite에만 저장: portability와 diff/recovery 가시성 저하

## Verification

- runtime home overlap fail-closed
- Relay state read/write spy 0
- install/uninstall/reinstall state diff
- same project separate Relay/Kernel namespace fixture
- explicit purge approval tests