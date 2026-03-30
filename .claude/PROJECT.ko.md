# PROJECT.md

> 프로젝트별로 작성해야 하는 템플릿입니다. 설치된 대상 프로젝트의 사실로 채워야 합니다.

Last-Reviewed: 2026-03-30

## 프로젝트 개요

- **서비스**: [서비스/제품 이름 및 간단한 설명]
- **스택**: [기술 스택 - 아래 가이드 참고]
- **응답 언어**: [기본 응답 언어 지정]

## 핵심 규칙

1. Human approval 은 planning closeout 에서 끝나며, blocker 가 없으면 execution loop 는 자율적으로 계속됩니다.
2. 새로운 API 또는 워크플로우 동작은 구현 전에 verification evidence 를 정의해야 합니다.
3. 지속 정책은 `PROJECT.md`, `docs/guidelines/`, `.claude/rules/` 에 둡니다.

## 테스트 규칙

- **테스트 프레임워크**: [테스트 실행 명령]
- **실행 명령**:
  - [개발 서버 실행 명령]
  - [빌드 명령]
  - [린트 명령]
  - [타입 체크 명령]
  - [테스트 실행 명령]

## 디렉터리/구조

```text
[프로젝트 루트]/
|-- [주요 폴더1]/
|-- [주요 폴더2]/
|-- [주요 폴더3]/
`-- .claude/
```

## API/데이터 통신 패턴

- **API 엔드포인트**: [API 라우트 규칙]
- **헬퍼 함수**: [자주 사용하는 유틸리티 함수]
- **계약 교환 방식**: [클라이언트에서 API 호출 방식]

## 타입/도메인 패턴

- **타입 정의 위치**: [타입 파일 위치 및 명명 규칙]
- **도메인 모델**: [Entity, DTO, Request/Response 구조]

## 권한/인증

- **인증 방식**: [JWT, Session 등]
- **권한 체계**: [권한 관리 방식]
- **민감 경로 정책**: [인증/권한 처리 미들웨어 위치]

## 문서 경로

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

## 환경 변수

```text
[환경 변수명]
```
