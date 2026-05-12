---
name: browser-session
description: 대화형 런타임 점검과 수동 QA 흐름을 위해 지속 로컬 브라우저 세션을 관리하고 사용합니다.
triggers:
  - "browser session"
  - "open browser session"
  - "interactive browser"
  - "persistent browser"
---

# Browser Session

## 역할

지속 로컬 런타임이 뒷받침하는 Codex-native 대화형 브라우저 세션을 제공합니다.

## 상태

이 스킬은 현재 scaffold입니다. 앞으로 추가될 브라우저 런타임의 계약과 예상 워크플로우를 정의합니다.

## 예정 도구

- control wrapper: `PATH`의 `browserctl` 또는 `.claude/bin/browserctl`
- future daemon root: `.claude/tools/browserd/`

## 사용 예

```bash
/browser-session --url=http://localhost:3000
/browser-session --url=https://staging.example.com --snapshot
/browser-session --url=http://localhost:3000 --screenshot=.claude/artifacts/home.png
```

## 예정 워크플로우

1. `browserctl`이 `PATH` 또는 `.claude/bin/browserctl`에 있는지 확인합니다.
2. 브라우저 daemon을 시작하거나 재사용합니다.
3. 대상 URL로 이동합니다.
4. 필요하면 `snapshot`, `screenshot`, `console`, `network`를 실행합니다.
5. 간결한 발견 사항과 다음 조치를 반환합니다.

## Fallback 정책

- `browserctl`을 사용할 수 없으면 중단하고 브라우저 런타임이 아직 설치되지 않았다고 보고합니다.
- 브라우저 상호작용이 성공한 것처럼 조용히 꾸미지 않습니다.
- 적절한 경우 현재 fallback 경로로 `browser-verifier`를 권장합니다.

## 출력 계약

- 대상 URL
- 런타임 상태
- 시도한 작업
- 생성된 산출물
- blocker 또는 setup gap

## 예정 명령

```bash
browserctl start
browserctl goto <url>
browserctl snapshot
browserctl screenshot [path]
browserctl console
browserctl network
```
