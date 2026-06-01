#!/usr/bin/env bash
set -euo pipefail

runtime="all"
ref="main"
dry_run=0
no_backup=0

while [ "$#" -gt 0 ]; do
	case "$1" in
		--runtime)
			runtime="${2:?missing runtime}"
			shift 2
			;;
		--ref)
			ref="${2:?missing ref}"
			shift 2
			;;
		--dry-run)
			dry_run=1
			shift
			;;
		--no-backup)
			no_backup=1
			shift
			;;
		*)
			echo "Unknown argument: $1" >&2
			exit 2
			;;
	esac
done

if ! command -v node >/dev/null 2>&1; then
	echo "Node.js is required for Moonshot Relay account-root installation." >&2
	exit 1
fi

temp_root="$(mktemp -d)"
trap 'rm -rf "$temp_root"' EXIT

zip_path="$temp_root/moonshot-relay.zip"
zip_url="https://github.com/munlucky/moonshot-relay/archive/refs/heads/$ref.zip"

echo "[INFO] Downloading $zip_url"
if command -v curl >/dev/null 2>&1; then
	curl -fsSL "$zip_url" -o "$zip_path"
elif command -v python3 >/dev/null 2>&1; then
	python3 - "$zip_url" "$zip_path" <<'PY'
import sys
from urllib.request import urlretrieve
urlretrieve(sys.argv[1], sys.argv[2])
PY
else
	echo "curl or python3 is required to download Moonshot Relay." >&2
	exit 1
fi

if command -v unzip >/dev/null 2>&1; then
	unzip -q "$zip_path" -d "$temp_root"
elif command -v python3 >/dev/null 2>&1; then
	python3 - "$zip_path" "$temp_root" <<'PY'
import sys
import zipfile
with zipfile.ZipFile(sys.argv[1]) as zf:
    zf.extractall(sys.argv[2])
PY
else
	echo "unzip or python3 is required to extract Moonshot Relay." >&2
	exit 1
fi

source_root="$(find "$temp_root" -maxdepth 1 -type d -name 'moonshot-relay-*' | head -n 1)"
if [ -z "$source_root" ]; then
	echo "Downloaded Moonshot Relay archive did not contain the expected source root." >&2
	exit 1
fi

installer="$source_root/scripts/install-account-root-harness.mjs"
if [ ! -f "$installer" ]; then
	echo "Account-root installer not found: $installer" >&2
	exit 1
fi

args=("$installer" "--runtime" "$runtime" "--source-root" "$source_root" "--remove-legacy-harness-core")
if [ "$dry_run" -eq 1 ]; then
	args+=("--dry-run")
fi
if [ "$no_backup" -eq 1 ]; then
	args+=("--no-backup")
fi

node "${args[@]}"
