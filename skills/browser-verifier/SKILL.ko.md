---
name: browser-verifier
description: Runs runtime/browser verification for web projects using URL health checks and optional E2E commands.
surfaceStatus: optional_bundle_member
context: fork
triggers:
  - "browser verify"
  - "runtime verify"
  - "verify ui"
  - "browser-verifier"
---

# Browser Verifier

## 공개 범위

이 스킬은 런타임/브라우저 검증을 위한 verification helper입니다.
사용자가 명시적으로 브라우저 검증을 요청한 경우가 아니라면 기본적으로 verification 흐름 뒤에서 실행하는 편이 맞습니다.
읽기 전용 verifier로 사용할 때는 fork된 검증 세션에서 실행하고, 호출자에게는 구조화된 verdict만 되돌리는 것을 기본으로 합니다.

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

- `claude-code`: fork된 verifier 의미를 유지한 채 Claude 도구 라우팅으로 런타임 검증을 실행합니다.
- `codex`: fresh forked verification session 또는 동등한 격리 attempt를 우선하며, 메인 세션은 coordinator로만 유지하고 요약 결과만 병합합니다.
- 활성 런타임이 격리된 verifier 실행을 유지할 수 없으면 current-session 실행으로 명시적으로 degrade하고, isolation이 약화됐음을 기록합니다.
- canonical verifier source는 `agents/verification/verify-runtime.sh`입니다.
- project-local Claude profile이 materialize된 경우 installed/local profile entrypoint는 `.claude/agents/verification/verify-runtime.sh`입니다.

## 실행
1. `--url` 또는 `APP_BASE_URL`에서 대상 URL을 결정합니다. (기본값: `http://localhost:3000`)
2. `--browser-flow`가 있으면 `PATH`의 `browserctl` 또는 `<MOONSHOT_RELAY_HOME>/bin/browserctl`을 사용해 설정된 browser flow runner를 실행합니다. 프로젝트가 custom runner를 설치한 경우에만 `BROWSER_FLOW_RUNNER_PATH`를 사용합니다.
3. browser runtime을 사용할 수 있고 호출자가 다른 flow를 명시하지 않았다면 standard verification path의 기본 browser-flow를 `smoke`로 취급합니다.
4. 가능하면 격리된 verifier 경계에서 URL 및 선택적 browser-flow/E2E 인자로 installed/local profile entrypoint `.claude/agents/verification/verify-runtime.sh`를 실행합니다.
5. `--e2e`가 없으면 다음 순서로 npm 스크립트를 자동 탐지합니다:
   - `test:e2e:agent-browser`
   - `test:e2e`
6. 런타임 체크 실패 시 즉시 중단하고 환경 준비 상태 문제를 보고합니다.
7. E2E 실패 시 실패한 명령과 상세 결과를 반환합니다.

## 출력 계약
- pass/fail 상태
- 대상 URL 및 HTTP 응답 요약
- optional browser-flow status
- optional browser-flow verdict file at `.moonshot-relay/browser-flow-verdict-<runId>.json`
- 선택적 E2E 결과
- runtime evidence depth: `smoke`, `open-act`, 또는 `open-act-mutate-persist-recover`
- critical scenario smoke-only warnings
- 다음 액션 (서버 재시작, 라우트 수정, 테스트 재실행)
- 호출자 세션에 병합 가능한 구조화된 요약

## Browser Flow Artifacts

- Runner verdict는 `.moonshot-relay/browser-flow-verdict-<runId>.json`에 기록됩니다.
- flow가 해당 artifact를 요청하면 screenshots, console events, network events는 `.moonshot-relay/browser-artifacts/` 아래에 기록됩니다.
- Browser trace metadata는 `scripts/verification-plane.mjs normalize-browser-trace --run-id <runId> --goal-id <goalId> --url <url> --flow <flow> --json`으로 정규화합니다.
- 정규화된 trace metadata는 `.moonshot-relay/browser-artifacts/<runId>/<goalId>/<flow>/trace-metadata.json`에 남기고 browser verification plane evidence에서 참조합니다.
- browser runtime 또는 flow declaration이 없으면 hand-written pass가 아니라 setup-gap verdict를 생성해야 합니다.
- Critical `SCN-*` flow는 clean finish 전에 smoke 이상의 interaction evidence가 필요합니다.

## Installed/local Profile Script
```bash
.claude/agents/verification/verify-runtime.sh --url=<url> [--browser-flow=<name>] [--browser-only] [--browserctl=<path>] [--e2e="<command>"] [--no-auto-e2e]
```
