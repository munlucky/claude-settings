#!/usr/bin/env python3
"""Archive completed phase docs under <plan-dir>/close and record their path."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

PHASE_START_RE = re.compile(r"^\s*-\s+number:\s*(\d+)")
REFERENCE_FIXTURE_SEGMENT = "/.claude/docs/runtime-parity-reference-plan"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--status-file", required=True)
    parser.add_argument("--plan-dir", required=True)
    parser.add_argument("--phase-number")
    return parser.parse_args()


def is_reference_fixture_path(path: Path) -> bool:
    normalized = path.resolve().as_posix().lower()
    return REFERENCE_FIXTURE_SEGMENT in normalized


def iter_phase_block_ranges(lines: list[str]) -> list[tuple[int, int, str]]:
    ranges: list[tuple[int, int, str]] = []
    current_start: int | None = None
    current_number: str | None = None

    for idx, line in enumerate(lines):
        match = PHASE_START_RE.match(line)
        if not match:
            continue
        if current_start is not None and current_number is not None:
            ranges.append((current_start, idx, current_number))
        current_start = idx
        current_number = match.group(1)

    if current_start is not None and current_number is not None:
        ranges.append((current_start, len(lines), current_number))

    return ranges


def read_top_level_value(block: list[str], key: str) -> str | None:
    item_indent = len(block[0]) - len(block[0].lstrip(" "))
    top_indent = " " * (item_indent + 2)
    prefix = f"{top_indent}{key}:"
    for line in block:
        if line.startswith(prefix):
            return line.split(":", 1)[1].strip().strip('"')
    return None


def read_root_value(lines: list[str], key: str) -> str | None:
    prefix = f"{key}:"
    for line in lines:
        stripped = line.strip()
        if stripped == "phases:":
            return None
        if stripped.startswith(prefix):
            return stripped.split(":", 1)[1].strip().strip('"')
    return None


def set_top_level_value(block: list[str], key: str, value: str) -> list[str]:
    item_indent = len(block[0]) - len(block[0].lstrip(" "))
    top_indent = " " * (item_indent + 2)
    prefix = f"{top_indent}{key}:"

    for idx, line in enumerate(block):
        if line.startswith(prefix):
            block[idx] = f"{prefix} {value}"
            return block

    insert_at = len(block)
    for idx in range(1, len(block)):
        stripped = block[idx].lstrip(" ")
        indent = len(block[idx]) - len(stripped)
        if indent <= item_indent:
            insert_at = idx
            break

    block.insert(insert_at, f"{prefix} {value}")
    return block


def looks_like_master_doc(path: Path) -> bool:
    lower_name = path.name.lower()
    return "master" in lower_name or lower_name.startswith("00-")


def find_phase_docs(directory: Path, phase_number: str) -> list[Path]:
    if not directory.exists():
        return []
    if is_reference_fixture_path(directory):
        return []

    phase_prefix = f"{int(phase_number):02d}-"
    prefixed_docs = sorted(
        path
        for path in directory.iterdir()
        if path.is_file()
        and path.suffix.lower() == ".md"
        and not looks_like_master_doc(path)
        and not is_reference_fixture_path(path)
        and path.name.startswith(phase_prefix)
    )
    if prefixed_docs:
        return prefixed_docs

    return sorted(
        path
        for path in directory.iterdir()
        if path.is_file()
        and path.suffix.lower() == ".md"
        and not looks_like_master_doc(path)
        and not is_reference_fixture_path(path)
        and "phase" in path.stem.lower()
        and phase_number in path.stem
    )


def choose_archive_destination(archive_dir: Path, source: Path) -> Path:
    destination = archive_dir / source.name
    if not destination.exists():
        return destination

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    candidate = archive_dir / f"{source.stem}.closed-{stamp}{source.suffix}"
    counter = 1
    while candidate.exists():
        candidate = archive_dir / f"{source.stem}.closed-{stamp}-{counter}{source.suffix}"
        counter += 1
    return candidate


def to_repo_relative(path: Path) -> str:
    return Path(os.path.relpath(path.resolve(), Path.cwd().resolve())).as_posix()


def main() -> int:
    args = parse_args()
    status_file = Path(args.status_file)
    plan_dir = Path(args.plan_dir)
    archive_dir = plan_dir / "close"

    if not status_file.exists() or not plan_dir.exists():
        return 0
    if is_reference_fixture_path(plan_dir):
        print(f"skipping runtime parity reference fixture: {to_repo_relative(plan_dir)}")
        return 0

    lines = status_file.read_text(encoding="utf-8").splitlines()
    master_plan = read_root_value(lines, "masterPlan")
    if master_plan:
        status_plan_dir = Path(master_plan).parent.resolve()
        if status_plan_dir != plan_dir.resolve():
            print(
                "plan-status-mismatch: "
                f"status masterPlan '{master_plan}' belongs to '{status_plan_dir}', not '{plan_dir.resolve()}'",
                file=sys.stderr,
            )
            return 2

    updates: list[str] = []

    for start, end, phase_number in reversed(iter_phase_block_ranges(lines)):
        if args.phase_number and phase_number != args.phase_number:
            continue

        block = lines[start:end]
        if read_top_level_value(block, "status") != "completed":
            continue

        archive_dir.mkdir(parents=True, exist_ok=True)
        archived_path: Path | None = None

        for source in find_phase_docs(plan_dir, phase_number):
            destination = archive_dir / source.name
            if not destination.exists():
                shutil.copy2(source, destination)
                updates.append(f"archived phase {int(phase_number):02d}: {to_repo_relative(destination)}")
            archived_path = archived_path or destination

        if archived_path is None:
            archived_candidates = find_phase_docs(archive_dir, phase_number)
            if archived_candidates:
                archived_path = archived_candidates[0]

        if archived_path is not None:
            block = set_top_level_value(
                block,
                "archivedPhaseDoc",
                f'"{to_repo_relative(archived_path)}"',
            )
            lines[start:end] = block

    status_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

    if updates:
        print("\n".join(updates))

    return 0


if __name__ == "__main__":
    sys.exit(main())
