#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "$ROOT/.codex/skills"
rsync -a --delete "$ROOT/.claude/skills/" "$ROOT/.codex/skills/"

echo "Synced .claude/skills -> .codex/skills"
