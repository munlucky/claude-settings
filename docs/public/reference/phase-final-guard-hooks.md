# Phase Final Guard Hooks

`scripts/phase-final-guard.mjs` is the runtime-neutral adapter for stopping false completion claims in phase-runner work.

It reads the current project phase projection from `.moonshot-relay/docs/phase-status.yaml` by default. The projection is not completion authority; the guard uses it only to detect actionable remaining phases. When every phase is marked complete, the guard checks for an accepted runtime-state completion decision before allowing a final completion claim.

## Claude Stop

Claude Code can run the guard from a `Stop` hook:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node ${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/scripts/phase-final-guard.mjs --mode claude-stop"
          }
        ]
      }
    ]
  }
}
```

When the last assistant message looks like a final completion claim and actionable phases remain, the guard returns:

```json
{
  "decision": "block",
  "reason": "Phase run is not complete. Continue <phase-doc> (<status>)."
}
```

Non-final status reports are allowed, even when remaining phases exist.

## Codex Stop

Codex can run the same guard from a `Stop` hook without replacing `notify`:

```json
{
  "Stop": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "node <MOONSHOT_RELAY_HOME>/scripts/phase-final-guard.mjs --mode codex-stop",
          "timeout": 30,
          "statusMessage": "Checking Moonshot phase completion"
        }
      ]
    }
  ]
}
```

When Codex receives `decision: "block"`, it continues with the guard `reason` as the next prompt.

## Codex Turn Ended Fallback

Codex can use the same script as a turn-ended notify adapter:

```toml
notify = ["node", "<MOONSHOT_RELAY_HOME>/scripts/phase-final-guard.mjs", "--mode", "codex-turn-ended"]
```

Codex turn-ended notification cannot reliably block the already-finished turn. Instead, the adapter writes `.moonshot-relay/docs/phase-final-guard-resume-required.json` when actionable phases remain or completion authority is missing.

The artifact contains `runId`, `goalId`, `activePhaseDoc`, `remainingPhases`, and `nextPrompt` so a host-level watchdog can resume the phase run without treating raw memory or phase projection as authority.
