---
name: codex-validate-plan
description: code-review로 아키텍처/계획 품질을 검증한다. `complex` 작업의 `feature`/`refactor`에서 `context.md` 작성 후 사용.

---

# Codex 계획 검증

## 사용 시점
- `complexity`: `complex`
- `taskType`: `feature` 또는 `refactor`
- `context.md`가 존재하거나 갱신됨

## 절차
1. context.md 경로를 수집한다.
2. code-review에 프롬프트를 직접 전달하고  백그라운드 실행한다.
3. 치명/경고/제안을 정리하고 통과/실패를 판단한다.

## 프롬프트 템플릿
```
다음 구현 계획(context.md) 경로를 확인하고 검토해주세요:

[context.md 경로]

검증 항목:
1. 아키텍처 적합성 및 유지보수성
2. 기술 스택 적합성
3. 파일/모듈 경계
4. 성능 리스크
5. 보안 리스크
6. 핵심 기술 리스크

출력:
- 통과 항목
- 경고 항목
- 치명 항목
```

## 출력 (patch)
```yaml
notes:
  - "codex-plan: 통과, 경고=2"
```
