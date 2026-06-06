---
name: qa-flow
description: 사용 가능한 경우 지속 브라우저 런타임을 사용해 로컬 또는 staging URL에 대해 guided browser-based QA flow를 실행합니다.
surfaceStatus: optional_bundle_member
triggers:
  - "qa flow"
  - "browser qa"
  - "flow verify"
  - "guided qa"
---

# QA Flow

## 역할

실제 브라우저 세션에서 사용자-facing flow를 검증하고 compact pass/fail report를 반환합니다.

## 상태

이 스킬은 optional verification-bundle member입니다.
대상 URL이 있으면 browser smoke check를 실행할 수 있고, 사용자가 이슈를 보고하는 경우 conversational QA triage 경로를 실행할 수 있습니다.
workflow가 guided browser QA를 명시적으로 선택하지 않는 한 default verification chain에는 포함되지 않습니다.

## 입력

- target URL
- `smoke`, `auth`, `checkout`, `dashboard` 같은 optional flow name
- optional auth/setup notes
- optional user-reported issue 또는 QA notes
- optional GitHub issue export intent

## 예정 런타임 경로

Primary path:

- `<MOONSHOT_RELAY_HOME>/bin/browserctl`

Fallback path:

- `skills/browser-verifier/SKILL.md`
- `agents/verification/verify-runtime.sh`

## 사용 예

```bash
/qa-flow --url=http://localhost:3000 --flow=smoke
/qa-flow --url=https://staging.example.com --flow=auth
/qa-flow --url=http://localhost:3000 --flow=dashboard --notes="requires seeded admin user"
```

## 워크플로우

1. target URL을 검증합니다.
2. 지속 브라우저 세션을 시작하거나 재사용합니다.
3. 페이지로 이동하고 initial snapshot을 수집합니다.
4. flow별 단계를 실행합니다.
5. critical `SCN-*`는 가능하면 full depth path를 우선합니다: open -> act -> mutate -> persist -> recover.
6. 가능한 경우 screenshot 또는 log excerpt로 실패를 캡처합니다.
7. 구체적인 next action이 포함된 pass/fail/warn summary를 반환합니다.

## Conversational QA Triage

사용자가 browser smoke run 대신 bug를 보고하는 경우:

1. expected behavior, actual behavior, reproduction steps가 빠졌을 때만 최대 2-3개의 짧은 확인 질문을 합니다.
2. 사용 가능한 project docs와 domain terms를 배경에서 탐색합니다.
3. 보고가 하나의 이슈인지, 독립적으로 고칠 수 있는 여러 이슈인지 결정합니다.
4. user-visible behavior 중심의 durable issue draft를 만듭니다.
5. GitHub export가 명시적으로 요청되고 GitHub tool/CLI를 사용할 수 있으면 dependency order로 issue를 만들고 URL을 반환합니다.

Issue draft는 다음을 지켜야 합니다.

- project domain language 사용
- expected vs actual behavior 설명
- reproduction steps 포함
- 사용자가 tactical implementation note를 요청하지 않는 한 file path와 line number 회피
- agent handoff가 예상되면 AFK/HITL classification 포함
- 확인된 bug에는 TDD fix-plan outline 포함

## Flow Contract

각 flow는 최종적으로 다음을 정의해야 합니다.

- entry URL
- prerequisite state
- expected visible markers
- critical interactions
- runtime evidence depth: `smoke` 또는 `open-act-mutate-persist-recover`
- pass/fail conditions
- `scripts/verification-plane.mjs normalize-browser-trace`가 생성한 normalized trace metadata path
- verification plane linkage: `plane=browser`, `status`, `tracePath`, `evidenceDepth`

## Output Contract

- flow name
- target URL
- runtime used
- pass/fail status
- runtime evidence depth
- critical scenario smoke-only warnings
- issues found
- suggested fixes 또는 follow-up checks
- 가능한 경우 screenshot, console excerpt, QA report update 같은 evidence path
- run/goal identity를 사용할 수 있으면 `.moonshot-relay/browser-artifacts/<runId>/<goalId>/<flow>/trace-metadata.json` 아래 browser trace metadata
