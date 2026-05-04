---
name: project-md-refresh
description: 현재 저장소를 분석해 `.claude/PROJECT.md`와 프로젝트 기준 문서 세트(`workflow/README.md`, `docs/design/README.md`, `docs/glossary/README.md`, `docs/daily/README.md`, `TEST_GUIDE.md`, `docs/analysis/README.md`)를 생성/갱신한다.
---

# 프로젝트 문서 부트스트랩 현행화

## 목표
근거 기반으로 프로젝트 기준 문서 세트를 생성하거나 갱신한다.

> 이 스킬은 생성기이며, 게이트 역할은 `project-contract-gate`가 담당한다.
> 이 스킬은 유지보수 유틸리티이며, 기본 구현 체인에는 포함하지 않는다.

## 워크플로우
1. 기준 파일을 찾는다.
   - `.claude/PROJECT.md`가 없으면 `assets/PROJECT.template.md`를 기준으로 생성한다.
   - 아래 프로젝트 기준 문서가 없으면 대응되는 asset 템플릿으로 생성한다.
     - `workflow/README.md`
     - `docs/design/README.md`
     - `docs/glossary/README.md`
     - `docs/daily/README.md`
     - `TEST_GUIDE.md`
     - `docs/analysis/README.md`
2. 저장소에서 스택, 명령어, 구조, 규칙 근거를 수집한다.
   - UI/디자인 시스템, 공통 용어, 테스트 진입점, 브랜치/스크립트 기반 워크플로우까지 함께 수집한다.
3. `.claude/PROJECT.md`와 프로젝트 기준 문서를 실제 프로젝트 내용으로 채운다.
4. 요약과 함께 어떤 최소 계약 영역이 준비되었는지 보고한다.

## 최소 계약 영역
- 개요
- 명령어
- 테스트 규칙
- 구조/패턴
- Git 워크플로우
- 핵심 규칙 / 경계
- 프로젝트 기준 문서

## 가드레일
- 추측 금지
- 정보 부족 시 TODO 또는 확인 질문
- 간결하고 프로젝트 맞춤형 유지
- 기존 사용자 작성 문서는 가능한 한 보존하고 필요한 부분만 갱신
