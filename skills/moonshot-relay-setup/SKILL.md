---
name: moonshot-relay-setup
description: Complete Moonshot Relay account-root installation after installing the repository with Agent Skills CLI.
---

# Moonshot Relay Setup

Use this skill when the user asks to install, refresh, or verify Moonshot Relay after running `npx skills add munlucky/moonshot-relay`, or when the current runtime only has the Agent Skills catalog and needs the full account-root profile.

## Contract

`npx skills add munlucky/moonshot-relay` installs this skill catalog only. It does not execute arbitrary repository installers. Treat that command as the bootstrap step, not as a complete Moonshot Relay runtime install.

If the user wants a single `npx` command that performs the same account-root installation as this setup script, use:

```bash
npx -y github:munlucky/moonshot-relay install
```

To complete installation, run the account-root installer from this skill:

- Windows PowerShell:

```powershell
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
powershell -ExecutionPolicy Bypass -File "$codexHome\skills\moonshot-relay-setup\scripts\install-account-root.ps1"
```

- macOS/Linux/Git Bash:

```bash
bash "${CODEX_HOME:-$HOME/.codex}/skills/moonshot-relay-setup/scripts/install-account-root.sh"
```

For a dry run:

```powershell
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
powershell -ExecutionPolicy Bypass -File "$codexHome\skills\moonshot-relay-setup\scripts\install-account-root.ps1" -DryRun
```

```bash
bash "${CODEX_HOME:-$HOME/.codex}/skills/moonshot-relay-setup/scripts/install-account-root.sh" --dry-run
```

## Verification

After installation, verify these account-root targets exist:

- `~/.moonshot-relay/.moonshot-relay-install-manifest.json`
- `~/.claude/.moonshot-relay-install-manifest.json`
- `~/.codex/.moonshot-relay-install-manifest.json`

If verification fails, report which target is missing and include the installer output. Do not claim the setup is complete from `npx skills add` alone.
