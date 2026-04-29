#!/bin/bash
# MCP Server Connection Check Script (Cross-platform)

echo ""
echo "=== MCP Server Status ==="
echo ""

ALL_OK=true

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

echo ""
if [[ "$ALL_OK" == "true" ]]; then
    echo "=== All MCP servers OK ==="
else
    echo "=== Some MCP servers have issues ==="
fi
echo ""
