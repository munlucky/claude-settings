---
name: codex-review-code
description: Codex CLI로 구현 품질과 회귀 리스크를 검토한다 (context: fork). 구현 완료 후 복잡한 작업, 리팩터, API 변경에서 사용.
context: fork
---

# Codex 코드 리뷰

## 절차
1. 변경 범위, 변경 파일, 핵심 동작을 요약하고 context.md 경로를 기록한다.
2. Codex CLI에 프롬프트를 직접 전달하고 `context: fork`로 백그라운드 실행한다.
3. 치명/경고/제안을 기록한다.

## 프롬프트 템플릿
```
context: fork
다음 구현을 검토해주세요 (context.md 경로 참조):
- [context.md 경로]

요약:

- 기능 요약
- 변경 파일
- 핵심 동작

검증 항목:
1. 로직/흐름 오류 및 누락된 엣지 케이스
2. 타입 안정성 및 에러 처리
3. API 계약 및 데이터 모델 일관성
4. 성능/리소스 낭비
5. 보안/인증/입력 검증
6. 프로젝트 규칙 및 유지보수성

출력:
- 통과 항목
- 경고 항목
- 치명 항목
```

## 출력 (patch)
```yaml
notes:
  - "codex-review: 통과, 경고=2"
```
