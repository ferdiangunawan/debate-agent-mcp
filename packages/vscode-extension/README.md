# Debate Agent MCP

Multi-agent code review & debate planning with P0/P1/P2 severity scoring.

## Features

- **Multi-Agent Debate**: Run 2, 3, or more AI agents on your code changes
- **P0/P1/P2 Severity**: Structured findings with priority levels
- **Debate Planning**: Create structured debate plans with different modes
- **Auto-Configuration**: Automatically configures MCP for VS Code
- **One-Click Install**: Install from marketplace, ready to use

## Installation

1. Install this extension from VS Code Marketplace
2. The extension automatically configures MCP on activation
3. Use `@mcp` in GitHub Copilot Chat to access debate tools

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_agents` | List all configured agents |
| `read_diff` | Read git diff from repository |
| `run_agent` | Run a single agent with prompt |
| `debate_review` | Multi-agent P0/P1/P2 code review |
| `debate_plan` | Create structured debate plan |

## Usage

### With GitHub Copilot Chat

```
@mcp debate_review question="Review this code for security issues"
```

### With Cline / Continue

The extension auto-configures MCP servers for these tools.

## Configuration

Configure default agents in VS Code settings:

```json
{
  "debateAgent.defaultAgents": ["codex", "claude"],
  "debateAgent.autoConfigureMcp": true
}
```

## Agent Configuration

Create a `debate-agent.config.json` in your project root:

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
    }
  }
}
```

## Commands

- **Debate Agent: Configure MCP Server** - Manually configure MCP
- **Debate Agent: Show Status** - Show current configuration status

## Requirements

- VS Code 1.85.0 or higher
- Node.js 18.0.0 or higher
- At least 2 CLI-based LLM agents installed

## License

MIT
