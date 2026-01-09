---
name: codex-test-integration
description: Codex MCP로 통합 영향과 회귀 리스크를 검증한다. `complex` 작업 또는 API 연동 시 사용.
---

# Codex 통합 검증

## 사용 시점
- `complexity`: `complex` (항상)
- 또는 `apiSpecConfirmed == true && hasMockImplementation == true`

## 절차
1. 변경 범위와 엔드포인트를 요약한다.
2. Codex MCP로 통합 검증 프롬프트를 실행한다.
3. 회귀 리스크와 추가 테스트 항목을 기록한다.

## 프롬프트 템플릿
```
다음 통합 변경사항을 검증해주세요:
- 기능 요약
- 변경 파일
- API 엔드포인트

검증 항목:
1. 회귀 리스크
2. 계약 준수
3. 엣지 케이스
4. 성능 이슈
5. 누락된 시나리오

출력:
- 통과
- 추가 테스트
- 회귀 리스크
```

## 출력 (patch)
```yaml
notes:
  - "codex-integration: 통과, 추가-테스트=2"
```
