---
name: pre-flight-check
description: 작업 시작 전에 필수 정보와 상태를 점검하고 readiness 시그널을 출력한다.
---

# Pre-Flight Check 스킬

## 역할
누락을 줄이기 위해 사전 상태를 점검하고, 오케스트레이터가 바로 분기할 수 있는 구조화된 readiness 시그널을 만든다.

## 입력
- `analysisContext.*`
- 기능명/브랜치명 (선택)
- `CLAUDE.md`, `PROJECT.md`, `context.md`, verification contract 등 관련 문서 경로
- 프로젝트 기준 문서가 있으면 `workflow/README.md`, `docs/design/README.md`, `docs/glossary/README.md`, `docs/daily/README.md`, `TEST_GUIDE.md`, `docs/analysis/README.md`

## 체크 항목
- `executionPlane`
- 프로젝트 계약서(`PROJECT.md`) 준비 상태
- 프로젝트 기준 문서(workflow/design/glossary/daily/test/analysis) 준비 상태
- task context(`context.md`) 준비 상태
- verification contract 준비 상태
- git 상태/브랜치, 빌드 상태
- 문서 메모리 정책과 문서 신선도

## 구조화된 출력 계약

```yaml
signals:
  executionPlane: product_project
  projectContractReady: false
  contextReady: false
  verificationContractReady: false
  shouldEscalateStrict: true
notes:
  - "pre-flight: executionPlane=product_project"
  - "pre-flight: project reference docs missing workflow/design/test guidance"
recommendedActions:
  - "run project-contract-gate"
  - "run context-readiness-gate"
```

## 안티패턴 대응
- 모호한 요청 -> `requirements-analyzer`
- PROJECT.md 또는 프로젝트 기준 문서 핵심 섹션 부족 -> `project-contract-gate` 또는 `project-md-refresh`
- context 최소 섹션 부족 -> `context-readiness-gate`
- 검증 계약 없음 -> `verification-contract-gate`

## 참조
- `.claude/docs/guidelines/context-readiness-schema.ko.md`
- `.claude/docs/guidelines/verification-contract.ko.md`
