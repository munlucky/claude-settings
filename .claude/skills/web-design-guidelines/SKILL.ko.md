---
name: web-design-guidelines
description: Web Interface Guidelines 기준으로 UI 코드를 리뷰합니다. "UI 리뷰", "접근성 점검", "디자인 감사", "UX 리뷰", "베스트 프랙티스 점검" 요청 시 사용합니다.
surfaceStatus: optional_bundle_member
context: fork
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Web Interface Guidelines 준수 여부를 기준으로 파일을 리뷰합니다.
읽기 전용 review owner로 취급하며, fork된 리뷰 세션을 우선하고 findings만 반환합니다.
기본 workflow 진입점이 아니라 `frontend-design` 아래 UI review-bundle helper로 사용합니다.

## 동작 방식

1. 아래 source URL에서 최신 가이드라인을 가져옵니다.
2. 지정된 파일(또는 패턴)을 읽습니다.
3. 가져온 가이드라인의 모든 규칙에 대조합니다.
4. 결과를 간결한 `file:line` 형식으로 출력합니다.

## 가이드라인 소스

리뷰 전마다 최신 가이드라인을 다시 가져옵니다.

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

WebFetch로 최신 규칙을 받아야 하며, 해당 문서에 출력 형식 지침도 포함되어 있습니다.

## 사용법

사용자가 파일이나 패턴을 주면:
1. 위 URL에서 가이드라인을 가져옵니다.
2. 지정된 파일을 읽습니다.
3. 모든 규칙을 적용합니다.
4. 가이드라인이 요구하는 형식으로 결과를 출력합니다.

파일이 지정되지 않았다면 어떤 파일을 리뷰할지 사용자에게 확인합니다.
