---
name: moonshot-relay-setup
description: Agent Skills CLI로 저장소를 설치한 뒤 Moonshot Relay account-root 설치를 완료할 때 사용합니다.
---

# Moonshot Relay Setup

`npx skills add munlucky/moonshot-relay` 실행 후 Moonshot Relay를 설치, 갱신, 검증해 달라는 요청이 있거나 현재 런타임에 Agent Skills catalog만 있고 전체 account-root profile이 필요한 경우 이 스킬을 사용합니다.

## Contract

`npx skills add munlucky/moonshot-relay`는 이 skill catalog만 설치합니다. 임의의 저장소 installer를 실행하지 않습니다. 이 명령은 bootstrap 단계이지 완성된 Moonshot Relay runtime install이 아닙니다.

같은 account-root 설치를 한 번의 `npx` 명령으로 수행하려면 다음을 사용합니다.

```bash
npx -y github:munlucky/moonshot-relay install
```

설치를 완료하려면 이 스킬의 account-root installer를 실행합니다.

- Windows PowerShell:

```powershell
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
powershell -ExecutionPolicy Bypass -File "$codexHome\skills\moonshot-relay-setup\scripts\install-account-root.ps1"
```

- macOS/Linux/Git Bash:

```bash
bash "${CODEX_HOME:-$HOME/.codex}/skills/moonshot-relay-setup/scripts/install-account-root.sh"
```

Dry run:

```powershell
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
powershell -ExecutionPolicy Bypass -File "$codexHome\skills\moonshot-relay-setup\scripts\install-account-root.ps1" -DryRun
```

```bash
bash "${CODEX_HOME:-$HOME/.codex}/skills/moonshot-relay-setup/scripts/install-account-root.sh" --dry-run
```

## Verification

설치 후 다음 account-root target이 존재하는지 확인합니다.

- `~/.moonshot-relay/.moonshot-relay-install-manifest.json`
- `~/.claude/.moonshot-relay-install-manifest.json`
- `~/.codex/.moonshot-relay-install-manifest.json`

검증이 실패하면 어떤 target이 누락됐는지 보고하고 installer output을 포함합니다. `npx skills add`만으로 setup이 완료됐다고 말하지 않습니다.
