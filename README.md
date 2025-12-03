# Debate Agent MCP

A multi-agent debate framework for **code review** and **debate planning** with P0/P1/P2 severity scoring.

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@debate-agent/core`](./packages/core) | Core logic (framework-agnostic) | `npm i @debate-agent/core` |
| [`@debate-agent/mcp-server`](./packages/mcp-server) | MCP server for CLI users | `npm i -g @debate-agent/mcp-server` |
| [`debate-agent-mcp`](./packages/vscode-extension) | VS Code extension | Install from marketplace |

## Quick Start

### For VS Code Users (One-Click Install)

1. Install **Debate Agent MCP** from VS Code Marketplace
2. Extension auto-configures MCP on activation
3. Use `@mcp` in Copilot Chat to access debate tools

### For CLI Users

```bash
# Install globally
npm install -g @debate-agent/mcp-server

# Start MCP server
debate-agent

# Or run directly
npx @debate-agent/mcp-server
```

### For SDK Users

```bash
npm install @debate-agent/core
```

```typescript
import { runDebate, createDebatePlan } from '@debate-agent/core';

// Run code review debate
const result = await runDebate({
  question: 'Review this code for security issues',
  agents: ['codex', 'claude'],
  platform: 'backend',
});

// Create debate plan
const plan = createDebatePlan('Best caching strategy', ['codex', 'claude'], 'collaborative', 2);
```

## Features

- **Multi-Agent Debate**: Run 2, 3, or more agents on your code changes
- **P0/P1/P2 Severity**: Structured findings with priority levels
- **Debate Planning**: Create structured debate plans with different modes
- **Platform-Specific Rules**: Specialized scrutiny for Flutter, Android, iOS, Backend
- **Deterministic Scoring**: Transparent rule-based judge system
- **Merged Recommendations**: Combines insights from all agents
- **100% Local**: No network requests, all processing happens locally

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_agents` | List all configured agents |
| `read_diff` | Read uncommitted git diff |
| `run_agent` | Run a single agent with prompt |
| `debate_review` | Multi-agent P0/P1/P2 code review |
| `debate_plan` | Create structured debate plan |

## Configuration

Create `debate-agent.config.json` in your project root:

```json
{
  "agents": {
    "codex": {
      "name": "codex",
      "path": "/opt/homebrew/bin/codex",
      "args": ["exec", "--skip-git-repo-check"],
      "timeout_seconds": 180
    },
    "claude": {
      "name": "claude",
      "path": "/opt/homebrew/bin/claude",
      "args": ["--print", "--dangerously-skip-permissions"],
      "timeout_seconds": 180
    },
    "gemini": {
      "name": "gemini",
      "path": "/opt/homebrew/bin/gemini",
      "args": ["--prompt"],
      "timeout_seconds": 180
    }
  },
  "debate": {
    "default_agents": ["codex", "claude"],
    "include_critique_round": true,
    "default_mode": "adversarial"
  }
}
```

## Severity Levels

| Level | Criteria |
|-------|----------|
| **P0** | Breaking defects, crashes, data loss, security/privacy problems, build blockers |
| **P1** | Likely bugs/regressions, incorrect logic, missing error-handling, missing tests |
| **P2** | Minor correctness issues, small logic gaps, non-blocking test gaps |

## Debate Modes

| Mode | Description |
|------|-------------|
| **adversarial** | Agents challenge each other's positions |
| **consensus** | Agents work to find common ground |
| **collaborative** | Agents build on each other's ideas |

## Scoring System

| Criteria | Points | Max |
|----------|--------|-----|
| P0 Finding | +15 | 45 |
| P1 Finding | +8 | 32 |
| P2 Finding | +3 | 12 |
| False Positive | -10 | -30 |
| Concrete Fix | +5 | 25 |
| File Accuracy | +2 | 10 |
| Clarity | 0-10 | 10 |

## Integration

### Claude Desktop

```json
{
  "mcpServers": {
    "debate-agent": {
      "command": "debate-agent"
    }
  }
}
```

### Claude CLI

```bash
claude mcp add debate-agent -- debate-agent
```

### VS Code / Cursor

Install the VS Code extension - it auto-configures MCP.

## Development

```bash
# Clone repo
git clone https://github.com/ferdiangunawan/debate-agent-mcp
cd debate-agent-mcp

# Install dependencies
npm install

# Build all packages
npm run build

# Build specific package
npm run build:core
npm run build:server
npm run build:extension
```

## Project Structure

```
debate-agent-mcp/
├── packages/
│   ├── core/                    # @debate-agent/core
│   │   ├── src/
│   │   │   ├── engine/          # Debate, Judge, Merger, Planner
│   │   │   ├── prompts/         # Review templates
│   │   │   ├── tools/           # Git diff, Agent runner
│   │   │   ├── config.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── mcp-server/              # @debate-agent/mcp-server
│   │   ├── src/
│   │   │   ├── index.ts         # MCP server entry
│   │   │   └── bin/cli.ts       # CLI entry
│   │   └── package.json
│   │
│   └── vscode-extension/        # debate-agent-mcp (VS Code)
│       ├── src/
│       │   └── extension.ts
│       ├── esbuild.js
│       └── package.json
│
├── debate-agent.config.json     # Example config
├── package.json                 # Monorepo root
├── pnpm-workspace.yaml
└── README.md
```

## License

MIT
