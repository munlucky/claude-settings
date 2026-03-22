---
name: browser-verifier
description: Runs runtime/browser verification for web projects using URL health checks and optional E2E commands.
triggers:
  - "browser verify"
  - "runtime verify"
  - "verify ui"
  - "browser-verifier"
---

# Browser Verifier

## 역할
구현 이후 웹 애플리케이션이 런타임에서 정상 접근/동작하는지 검증합니다.

## 사전 조건
- 실행 중인 로컬 개발 서버 또는 스테이징 URL
- 선택적 E2E 명령이 프로젝트에 구성되어 있을 것
- 권장 npm 스크립트:
  - `test:e2e:agent-browser` (기능 흐름 검증 우선)
  - `test:e2e` (기존 러너/폴백)

## 사용법
```bash
/browser-verifier --url=http://localhost:3000
/browser-verifier --url=http://localhost:3000                         # E2E 스크립트 자동 탐지
/browser-verifier --url=http://localhost:3000 --no-auto-e2e           # URL만 검증
/browser-verifier --url=https://staging.example.com --e2e="npm run test:e2e:agent-browser"
/browser-verifier --url=https://staging.example.com --e2e="npm run test:e2e"
```

## 런타임 어댑터 정책

- `claude-code`: Claude 도구 라우팅을 통해 런타임 검증 실행
- `codex`: 현재 Codex 세션에서 동일 검증을 직접 실행
- 두 런타임 모두 표준 검증 스크립트로 `.claude/agents/verification/verify-runtime.sh`를 사용

## 실행
1. `--url` 또는 `APP_BASE_URL`에서 대상 URL을 결정합니다. (기본값: `http://localhost:3000`)
2. URL 및 선택적 E2E 명령으로 `.claude/agents/verification/verify-runtime.sh`를 실행합니다. (Claude 런타임은 도구 라우팅, Codex 런타임은 직접 셸 실행)
3. `--e2e`가 없으면 다음 순서로 npm 스크립트를 자동 탐지합니다:
   - `test:e2e:agent-browser`
   - `test:e2e`
4. 런타임 체크 실패 시 즉시 중단하고 환경 준비 상태 문제를 보고합니다.
5. E2E 실패 시 실패한 명령과 상세 결과를 반환합니다.

## 출력 계약
- pass/fail 상태
- 대상 URL 및 HTTP 응답 요약
- 선택적 E2E 결과
- 다음 액션 (서버 재시작, 라우트 수정, 테스트 재실행)

## 스크립트
```bash
.claude/agents/verification/verify-runtime.sh --url=<url> [--e2e="<command>"] [--no-auto-e2e]
```
