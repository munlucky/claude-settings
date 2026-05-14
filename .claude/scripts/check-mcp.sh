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

    return 1
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
    if PYTHONUTF8=1 PYTHONIOENCODING=utf-8 "$CRG_COMMAND" --version > /dev/null 2>&1; then
        echo "[OK] code-review-graph available"
    else
        echo "[WARN] code-review-graph command found but version check failed"
    fi

    mkdir -p "$CRG_LOG_DIR"
    CRG_STATUS=$(PYTHONUTF8=1 PYTHONIOENCODING=utf-8 "$CRG_COMMAND" status --repo . 2>&1 || true)
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
