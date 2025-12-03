# Quick Start Guide

## Project Structure

```
debate-reviewer-mcp/
├── src/                    # TypeScript source code
│   ├── index.ts           # MCP server entry point
│   ├── types.ts           # Type definitions
│   ├── config.ts          # Configuration loader
│   ├── tools/             # MCP tool implementations
│   │   ├── read-diff.ts
│   │   ├── run-agent.ts
│   │   └── debate-review.ts
│   └── engine/            # Debate engine
│       ├── judge.ts       # Scoring system
│       ├── merger.ts      # Recommendation merger
│       └── debate.ts      # Orchestration
├── dist/                  # Compiled JavaScript
├── config.json            # CLI paths configuration
├── package.json
├── tsconfig.json
├── README.md              # Full documentation
└── examples/              # Integration examples
    ├── claude-desktop.json
    ├── vscode-settings.json
    └── cli-test.sh
```

## Next Steps

### 1. Test the Server

```bash
cd debate-reviewer-mcp

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

### 2. Add to Claude Code CLI

```bash
claude mcp add debate-reviewer -- node /Users/ferdiangunawan/Documents/kick_avenue/repo/debate-reviewer-mcp/dist/index.js
```

### 3. Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "debate-reviewer": {
      "command": "node",
      "args": ["/Users/ferdiangunawan/Documents/kick_avenue/repo/debate-reviewer-mcp/dist/index.js"]
    }
  }
}
```

## Usage Example

Once integrated, you can use these tools:

### Read Diff
```
Use the read_diff tool to see uncommitted changes
```

### Run Single Agent
```
Use run_agent with agent="claude" and prompt="Review this code"
```

### Full Debate Review
```
Use debate_review with question="Review this code for bugs and security issues"
```

## Configuration

Edit `config.json` to change CLI paths:

```json
{
  "agents": {
    "codex": {
      "path": "/opt/homebrew/bin/codex",
      "args": ["--print", "--prompt"],
      "timeout_seconds": 120
    },
    "claude": {
      "path": "/opt/homebrew/bin/claude",
      "args": ["--print", "--dangerously-skip-permissions", "-p"],
      "timeout_seconds": 120
    }
  }
}
```

## Scoring System

The judge uses deterministic rules:

- **Clarity**: +2 per formatting indicator (max 10)
- **Concrete**: +3 per concrete reference (max 15)
- **Hallucination**: -5 per non-existent file (max -25)
- **Reproducible**: +4 per actionable step (max 20)

**Total Range**: -25 to 45 points

## Troubleshooting

### Build Errors
```bash
npm run build
```

### Update Dependencies
```bash
npm install
npm run build
```

### Check Server Status
```bash
node dist/index.js
# Should output: [debate-reviewer-mcp] Starting MCP server...
# Then wait for stdin (Ctrl+C to exit)
```

## Development

### Watch Mode
```bash
npm run dev
```

### Rebuild
```bash
npm run clean
npm run build
```

## Files Created

✅ 16 TypeScript source files
✅ Compiled JavaScript in dist/
✅ Full documentation (README.md)
✅ Example configurations
✅ Configuration file with Homebrew paths

## What's Next?

1. **Test it**: Run `npx @modelcontextprotocol/inspector node dist/index.js`
2. **Integrate it**: Add to Claude Code or Claude Desktop
3. **Use it**: Make some code changes and run a debate review!

Happy coding! 🚀
