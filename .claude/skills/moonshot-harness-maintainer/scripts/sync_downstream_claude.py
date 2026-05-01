#!/usr/bin/env python3
"""Conservatively sync shared Moonshot .claude assets to downstream projects."""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


SYNC_FILES = [
    "CLAUDE.md",
    "CLAUDE.ko.md",
    "README.md",
    "README.ko.md",
    "verification.contract.yaml",
    "code-policy-baseline.txt",
    "docs/memory-mcp-guide.md",
]

SYNC_DIRS = [
    "agents",
    "bin",
    "config",
    "rules",
    "schemas",
    "scripts",
    "skills",
    "skills-archive",
    "templates",
    "tools",
    "docs/guidelines",
    "docs/ko",
    "docs/reference",
    "docs/reference-downstream",
    "docs/runtime-parity-reference-plan",
    "docs/solutions",
]

CODEX_SYNC_FILES = [
    "config.toml",
]

CODEX_SYNC_DIRS = [
    "agents",
]


def as_claude_dir(path: Path) -> Path:
    if path.name == ".claude":
        return path
    return path / ".claude"


def log(dry_run: bool, message: str) -> None:
    prefix = "DRY-RUN " if dry_run else ""
    print(f"{prefix}{message}")


def copy_file(src: Path, dest: Path, dry_run: bool) -> None:
    if not src.exists():
        return
    log(dry_run, f"file {src} -> {dest}")
    if dry_run:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def sync_dir(src: Path, dest: Path, dry_run: bool) -> None:
    if not src.exists():
        return
    log(dry_run, f"dir  {src} -> {dest}")
    if dry_run:
        return
    if dest.exists():
        shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dest)


def sync_target(source: Path, target: Path, dry_run: bool) -> None:
    target_claude = as_claude_dir(target).resolve()
    source = source.resolve()
    if source == target_claude:
        raise ValueError(f"target equals source: {target_claude}")

    log(dry_run, f"sync target {target_claude}")
    if not dry_run:
        target_claude.mkdir(parents=True, exist_ok=True)

    for rel in SYNC_FILES:
        copy_file(source / rel, target_claude / rel, dry_run)
    for rel in SYNC_DIRS:
        sync_dir(source / rel, target_claude / rel, dry_run)

    source_codex = source.parent / ".codex"
    target_codex = target_claude.parent / ".codex"
    if source_codex.is_dir():
        log(dry_run, f"sync target {target_codex}")
        if not dry_run:
            target_codex.mkdir(parents=True, exist_ok=True)
        for rel in CODEX_SYNC_FILES:
            copy_file(source_codex / rel, target_codex / rel, dry_run)
        for rel in CODEX_SYNC_DIRS:
            sync_dir(source_codex / rel, target_codex / rel, dry_run)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync shared Moonshot .claude assets while preserving project-local files.",
    )
    parser.add_argument(
        "targets",
        nargs="+",
        help="Project roots or .claude directories to update.",
    )
    parser.add_argument(
        "--source",
        default=".claude",
        help="Source .claude directory. Defaults to ./.claude.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned copies without modifying targets.",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    source = Path(args.source)
    if not source.is_dir():
        print(f"source .claude directory not found: {source}", file=sys.stderr)
        return 2

    try:
        for target in args.targets:
            sync_target(source, Path(target), args.dry_run)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2

    print("sync complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
