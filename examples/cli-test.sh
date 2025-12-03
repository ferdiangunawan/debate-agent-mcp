#!/bin/bash

# CLI testing script for debate-reviewer-mcp

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== debate-reviewer-mcp CLI Test ==="
echo ""

# Check if built
if [ ! -f "$PROJECT_DIR/dist/index.js" ]; then
    echo "Error: dist/index.js not found. Run 'pnpm build' first."
    exit 1
fi

echo "1. Testing with MCP Inspector..."
echo "   Run: npx @modelcontextprotocol/inspector node $PROJECT_DIR/dist/index.js"
echo ""

echo "2. Adding to Claude Code CLI..."
echo "   Run: claude mcp add debate-reviewer -- node $PROJECT_DIR/dist/index.js"
echo ""

echo "3. Example tool calls:"
echo ""
echo "   read_diff:"
echo '   {"staged": false}'
echo ""
echo "   run_agent:"
echo '   {"agent": "claude", "prompt": "Review this code"}'
echo ""
echo "   debate_review:"
echo '   {"question": "Review this code for bugs and security issues"}'
echo ""

echo "=== Testing MCP Server ==="
echo "Starting server for manual testing (Ctrl+C to exit)..."
echo ""

node "$PROJECT_DIR/dist/index.js"
