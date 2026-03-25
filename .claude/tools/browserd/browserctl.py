#!/usr/bin/env python3

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
RUNTIME_DIR = ROOT_DIR / "browser-runtime"
STATE_PATH = RUNTIME_DIR / "state.json"
DEFAULT_TIMEOUT = 10


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_runtime_dir() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def load_state() -> dict:
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_state(state: dict) -> None:
    ensure_runtime_dir()
    state["updatedAt"] = now_iso()
    STATE_PATH.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def print_json(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def usage() -> int:
    sys.stdout.write(
        "\n".join(
            [
                "browserctl",
                "",
                "Available commands:",
                "  start",
                "  stop",
                "  health [--json]",
                "  goto <url> [--timeout=<seconds>] [--json]",
                "  snapshot",
                "  click <ref>",
                "  type <ref> <text>",
                "  screenshot [path]",
                "  console",
                "  network",
            ]
        )
        + "\n"
    )
    return 0


def start_command() -> int:
    state = load_state()
    if not state:
        state = {
            "runtime": "python-http-session",
            "status": "running",
            "startedAt": now_iso(),
            "transport": "urllib",
            "version": "phase-1",
        }
    else:
        state["status"] = "running"

    state["lastCommand"] = "start"
    save_state(state)
    sys.stdout.write(f"browserctl start: ready ({STATE_PATH})\n")
    return 0


def stop_command() -> int:
    state = load_state()
    if not state:
        sys.stdout.write("browserctl stop: not running\n")
        return 0

    state["status"] = "stopped"
    state["lastCommand"] = "stop"
    save_state(state)
    sys.stdout.write("browserctl stop: state marked stopped\n")
    return 0


def health_command(json_mode: bool) -> int:
    state = load_state()
    if not state or state.get("status") != "running":
        payload = {
            "healthy": False,
            "reason": "runtime_not_started",
            "statePath": str(STATE_PATH),
        }
        if json_mode:
            print_json(payload)
        else:
            sys.stdout.write("browserctl health: not running\n")
        return 1

    payload = {
        "healthy": True,
        "runtime": state.get("runtime"),
        "statePath": str(STATE_PATH),
        "startedAt": state.get("startedAt"),
        "updatedAt": state.get("updatedAt"),
        "lastCommand": state.get("lastCommand"),
        "lastUrl": state.get("lastUrl"),
        "lastHttpCode": state.get("lastHttpCode"),
        "transport": state.get("transport"),
        "version": state.get("version"),
    }
    if json_mode:
        print_json(payload)
    else:
        sys.stdout.write(
            "browserctl health: healthy"
            f" runtime={payload['runtime']}"
            f" last_url={payload.get('lastUrl') or '-'}"
            f" last_http={payload.get('lastHttpCode') or '-'}\n"
        )
    return 0


def fetch_url(url: str, timeout: int) -> tuple[int, str]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "browserctl/phase-1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return int(response.getcode() or 0), response.geturl()
    except urllib.error.HTTPError as exc:
        return int(exc.code or 0), exc.geturl() or url
    except urllib.error.URLError:
        return 0, url


def goto_command(argv: list[str]) -> int:
    if not argv:
        sys.stderr.write("browserctl goto: missing <url>\n")
        return 64

    url = argv[0]
    timeout = DEFAULT_TIMEOUT
    json_mode = False

    for arg in argv[1:]:
        if arg == "--json":
            json_mode = True
        elif arg.startswith("--timeout="):
            try:
                timeout = int(arg.split("=", 1)[1])
            except ValueError:
                sys.stderr.write(f"browserctl goto: invalid timeout '{arg}'\n")
                return 64
        else:
            sys.stderr.write(f"browserctl goto: unsupported argument '{arg}'\n")
            return 64

    state = load_state()
    if not state or state.get("status") != "running":
        start_command()
        state = load_state()

    http_code, final_url = fetch_url(url, timeout)
    passed = 200 <= http_code < 400

    state["lastCommand"] = "goto"
    state["lastUrl"] = url
    state["lastFinalUrl"] = final_url
    state["lastHttpCode"] = str(http_code or "000")
    state["lastResult"] = "passed" if passed else "failed"
    save_state(state)

    payload = {
        "ok": passed,
        "url": url,
        "finalUrl": final_url,
        "httpCode": str(http_code or "000"),
        "statePath": str(STATE_PATH),
    }

    if json_mode:
        print_json(payload)
    else:
        sys.stdout.write(
            "browserctl goto:"
            f" status={'passed' if passed else 'failed'}"
            f" http={payload['httpCode']}"
            f" url={final_url}\n"
        )

    return 0 if passed else 1


def unimplemented_command(name: str) -> int:
    sys.stderr.write(
        f"browserctl {name}: not implemented yet; phase-1 currently supports start, stop, health, goto\n"
    )
    return 64


def main(argv: list[str]) -> int:
    if not argv or argv[0] in {"-h", "--help", "help"}:
        return usage()

    cmd = argv[0]
    rest = argv[1:]

    if cmd == "start":
        return start_command()
    if cmd == "stop":
        return stop_command()
    if cmd == "health":
        return health_command("--json" in rest)
    if cmd == "goto":
        return goto_command(rest)
    if cmd in {"snapshot", "click", "type", "screenshot", "console", "network"}:
        return unimplemented_command(cmd)

    sys.stderr.write(f"browserctl: unknown command '{cmd}'\n")
    return 64


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
