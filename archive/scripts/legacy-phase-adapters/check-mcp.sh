#!/bin/bash
# MCP Server Connection Check Script (Cross-platform)

echo ""
echo "=== MCP Server Status ==="
echo ""

ALL_OK=true
CRG_COMMAND=""
CRG_WINDOWS_ONLY=""
CRG_LOG_DIR=".claude/logs/code-review-graph"
CRG_FALLBACK_EVIDENCE_PATH="$CRG_LOG_DIR/fallback-status.log"
CRG_PROBE_TIMEOUT_SECONDS="${CRG_PROBE_TIMEOUT_SECONDS:-5}"
CRG_DEBUG_BROAD_SEARCH="${CRG_DEBUG_BROAD_SEARCH:-false}"
CRG_BROAD_SEARCH_MAX_FILES="${CRG_BROAD_SEARCH_MAX_FILES:-200}"
CRG_BROAD_SEARCH_TIMEOUT_SECONDS="${CRG_BROAD_SEARCH_TIMEOUT_SECONDS:-10}"
CRG_BROAD_SEARCH_MAX_OUTPUT_LINES="${CRG_BROAD_SEARCH_MAX_OUTPUT_LINES:-80}"
CRG_BROAD_SEARCH_ATTEMPTED=false

run_with_optional_timeout() {
    local seconds="$1"
    shift
    if command -v timeout > /dev/null 2>&1; then
        timeout "${seconds}s" "$@"
    else
        "$@"
    fi
}

record_crg_fallback_evidence() {
    mkdir -p "$CRG_LOG_DIR"
    printf '%s\n' "$1" > "$CRG_FALLBACK_EVIDENCE_PATH"
}

is_disallowed_broad_root() {
    local root="$1"
    local package_root="${CODE_REVIEW_GRAPH_PACKAGE_ROOT:-}"
    case "$root" in
        *npm-cache/_npx*|*npm-cache\\_npx*|*_npx*)
            if [[ -n "$package_root" && "$root" == "$package_root" ]]; then
                return 1
            fi
            return 0
            ;;
    esac
    return 1
}

try_debug_broad_search() {
    [[ "$CRG_DEBUG_BROAD_SEARCH" == "true" ]] || return 1
    [[ "$CRG_BROAD_SEARCH_ATTEMPTED" == "false" ]] || return 1
    CRG_BROAD_SEARCH_ATTEMPTED=true

    local roots=("$PWD")
    if [[ -n "${CODE_REVIEW_GRAPH_PACKAGE_ROOT:-}" ]]; then
        roots+=("$CODE_REVIEW_GRAPH_PACKAGE_ROOT")
    fi

    local root
    local inspected=0
    local output_lines=0
    local search_output=""
    local started_at="$SECONDS"
    for root in "${roots[@]}"; do
        if [[ ! -d "$root" ]]; then
            continue
        fi
        if is_disallowed_broad_root "$root"; then
            record_crg_fallback_evidence "broad_search_timeout skipped_root=$root reason=disallowed_user_cache_root"
            echo "[WARN] code-review-graph broad search skipped disallowed root: $root"
            continue
        fi

        local elapsed=$((SECONDS - started_at))
        local remaining_seconds=$((CRG_BROAD_SEARCH_TIMEOUT_SECONDS - elapsed))
        if [[ "$remaining_seconds" -le 0 || "$inspected" -ge "$CRG_BROAD_SEARCH_MAX_FILES" || "$output_lines" -ge "$CRG_BROAD_SEARCH_MAX_OUTPUT_LINES" ]]; then
            record_crg_fallback_evidence "broad_search_timeout skipped_root=$root inspected=$inspected output_lines=$output_lines"
            echo "[WARN] code-review-graph broad search reached cap; see $CRG_FALLBACK_EVIDENCE_PATH"
            return 1
        fi

        local remaining_files=$((CRG_BROAD_SEARCH_MAX_FILES - inspected))
        local remaining_output_lines=$((CRG_BROAD_SEARCH_MAX_OUTPUT_LINES - output_lines))
        local inspected_paths
        inspected_paths="$(run_with_optional_timeout "$remaining_seconds" find "$root" -type f -print 2>/dev/null | head -n "$remaining_files" || true)"
        inspected=$((inspected + $(printf '%s\n' "$inspected_paths" | sed '/^$/d' | wc -l | tr -d ' ')))
        local root_output
        root_output="$(printf '%s\n' "$inspected_paths" | while IFS= read -r candidate_path; do
            case "$(basename "$candidate_path")" in
                code-review-graph|code-review-graph.exe)
                    printf '%s\n' "$candidate_path"
                    ;;
            esac
        done | head -n "$remaining_output_lines" || true)"
        search_output="${search_output}${root_output}"$'\n'
        output_lines=$(printf '%s\n' "$search_output" | sed '/^$/d' | wc -l | tr -d ' ')
        local candidate
        candidate="$(printf '%s\n' "$root_output" | sed '/^$/d' | head -1)"
        if [[ -n "$candidate" && -x "$candidate" ]]; then
            CRG_COMMAND="$candidate"
            record_crg_fallback_evidence "broad_search_resolved command=$candidate inspected=$inspected"
            return 0
        fi
        if [[ "$output_lines" -ge "$CRG_BROAD_SEARCH_MAX_OUTPUT_LINES" || ( "$inspected" -ge "$CRG_BROAD_SEARCH_MAX_FILES" && "$output_lines" -eq 0 ) ]]; then
            record_crg_fallback_evidence "broad_search_timeout skipped_root=$root inspected=$inspected output_lines=$output_lines"
            echo "[WARN] code-review-graph broad search reached cap; see $CRG_FALLBACK_EVIDENCE_PATH"
            return 1
        fi
    done

    local candidate
    candidate="$(printf '%s\n' "$search_output" | sed '/^$/d' | head -1)"
    if [[ -n "$candidate" && -x "$candidate" ]]; then
        CRG_COMMAND="$candidate"
        record_crg_fallback_evidence "broad_search_resolved command=$candidate inspected=$inspected"
        return 0
    fi

    record_crg_fallback_evidence "broad_search_timeout skipped_root=none inspected=$inspected output_lines=$output_lines"
    return 1
}

resolve_code_review_graph() {
    if [[ -n "${CODE_REVIEW_GRAPH_COMMAND:-}" ]]; then
        CRG_COMMAND="$CODE_REVIEW_GRAPH_COMMAND"
        return 0
    fi

    if command -v code-review-graph > /dev/null 2>&1; then
        CRG_COMMAND="$(command -v code-review-graph)"
        return 0
    fi

    local candidates=()
    candidates+=("$HOME/.local/bin/code-review-graph")
    candidates+=("$HOME/.local/bin/code-review-graph.exe")
    candidates+=("$HOME/pipx/venvs/code-review-graph/Scripts/code-review-graph.exe")

    if [[ -n "${USER:-}" ]]; then
        candidates+=("/mnt/c/Users/$USER/pipx/venvs/code-review-graph/Scripts/code-review-graph.exe")
        candidates+=("/c/Users/$USER/pipx/venvs/code-review-graph/Scripts/code-review-graph.exe")
        candidates+=("/cygdrive/c/Users/$USER/pipx/venvs/code-review-graph/Scripts/code-review-graph.exe")
    fi

    if [[ -n "${USERPROFILE:-}" ]] && command -v cygpath > /dev/null 2>&1; then
        local userprofile_unix
        userprofile_unix="$(cygpath -u "$USERPROFILE" 2>/dev/null || true)"
        if [[ -n "$userprofile_unix" ]]; then
            candidates+=("$userprofile_unix/pipx/venvs/code-review-graph/Scripts/code-review-graph.exe")
            candidates+=("$userprofile_unix/.local/bin/code-review-graph.exe")
            candidates+=("$userprofile_unix/.local/bin/code-review-graph")
        fi
    fi

    local candidate
    for candidate in "${candidates[@]}"; do
        if [[ -x "$candidate" ]]; then
            case "$candidate" in
                /mnt/c/*|/c/*|/cygdrive/c/*)
                    if [[ "$(uname -s 2>/dev/null || true)" == Linux* ]]; then
                        CRG_WINDOWS_ONLY="$candidate"
                        return 1
                    fi
                    ;;
            esac
            CRG_COMMAND="$candidate"
            return 0
        fi
    done

    try_debug_broad_search
}

# Detect platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="linux"
else
    PLATFORM="windows"
fi

# Check Codex server
if command -v codex &> /dev/null; then
    if [[ "$PLATFORM" == "windows" ]]; then
        CODEX_PID=$(tasklist //FI "IMAGENAME eq codex.exe" //FO CSV //NH 2>/dev/null | head -1 | tr -d '"' | awk -F',' '{print $2}')
        if [[ -n "$CODEX_PID" ]]; then
            echo "[OK] Codex MCP server running"
        else
            echo "[FAIL] Codex MCP server not running"
            echo "  -> Run 'codex -m gpt-5.2-codex mcp-server'"
            ALL_OK=false
        fi
    else
        # macOS/Linux
        if pgrep -x "codex" > /dev/null; then
            CODEX_PID=$(pgrep -x "codex" | head -1)
            echo "[OK] Codex MCP server running (PID: $CODEX_PID)"
        else
            echo "[FAIL] Codex MCP server not running"
            echo "  -> Run 'codex -m gpt-5.2-codex mcp-server'"
            ALL_OK=false
        fi
    fi
else
    echo "[WARN] Codex command not found in PATH"
    ALL_OK=false
fi

# Check MemoryGraph server
if command -v memorygraph &> /dev/null; then
    if MEMORYGRAPH_DATA_DIR=".claude/memorygraph" memorygraph --health > /dev/null 2>&1; then
        echo "[OK] MemoryGraph available"
    else
        echo "[WARN] MemoryGraph command found but health check failed"
        echo "  -> Run 'MEMORYGRAPH_DATA_DIR=.claude/memorygraph memorygraph --health'"
    fi
else
    echo "[WARN] memorygraph command not found in PATH"
    echo "  -> Install with 'pipx install memorygraphMCP'"
fi

# Check code-review-graph server
if resolve_code_review_graph; then
    if run_with_optional_timeout "$CRG_PROBE_TIMEOUT_SECONDS" env PYTHONUTF8=1 PYTHONIOENCODING=utf-8 "$CRG_COMMAND" --version > /dev/null 2>&1; then
        echo "[OK] code-review-graph available"
    else
        echo "[WARN] code-review-graph command found but version check failed"
    fi

    mkdir -p "$CRG_LOG_DIR"
    CRG_STATUS=$(run_with_optional_timeout "$CRG_PROBE_TIMEOUT_SECONDS" env PYTHONUTF8=1 PYTHONIOENCODING=utf-8 "$CRG_COMMAND" status --repo . 2>&1 || true)
    printf '%s\n' "$CRG_STATUS" > "$CRG_FALLBACK_EVIDENCE_PATH"
    if echo "$CRG_STATUS" | grep -qi "not.*built\|not.*initialized\|no graph\|missing\|not found"; then
        echo "[WARN] code-review-graph graph not built yet"
        echo "  -> Run on demand: code-review-graph build --repo ."
    elif echo "$CRG_STATUS" | grep -qi "error\|traceback\|failed"; then
        echo "[WARN] code-review-graph status check returned a warning"
        echo "  -> $CRG_STATUS"
    else
        echo "[OK] code-review-graph status checked"
    fi
else
    if [[ -n "$CRG_WINDOWS_ONLY" ]]; then
        echo "[WARN] code-review-graph installed in Windows pipx venv but not executable from this Bash runtime"
        echo "  -> MCP wrapper uses the Windows executable directly; run PowerShell or the wrapper for version/status smoke"
    else
        echo "[WARN] code-review-graph command not found in PATH"
        echo "  -> Install with 'pipx install \"code-review-graph[communities]\"'"
    fi
fi

echo ""
if [[ "$ALL_OK" == "true" ]]; then
    echo "=== All MCP servers OK ==="
else
    echo "=== Some MCP servers have issues ==="
fi
echo ""
