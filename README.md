# debate-reviewer-mcp

A local MCP (Model Context Protocol) server that performs agent debate between multiple CLI-based LLM agents (Codex CLI, Claude Code CLI) with a deterministic rule-based judge.

## Features

- **Agent Debate**: Run both Codex and Claude CLI agents on your code changes
- **Deterministic Scoring**: Rule-based judge with transparent scoring
- **Critique Round**: Optional critique round where agents critique each other
- **Merged Recommendations**: Combines insights from both agents into a final recommendation
- **100% Local**: No network requests, all processing happens locally

## Installation

### Prerequisites

- Node.js >= 18.0.0
- pnpm (or npm/yarn)
- Codex CLI (`/opt/homebrew/bin/codex` or configure in `config.json`)
- Claude Code CLI (`/opt/homebrew/bin/claude` or configure in `config.json`)

### Setup

```bash
# Navigate to the project directory
cd debate-reviewer-mcp

# Install dependencies
pnpm install

# Build TypeScript
pnpm build
```

## Configuration

Edit `config.json` to configure CLI paths and settings:

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
  },
  "debate": {
    "include_critique_round": true,
    "max_output_length": 10000
  },
  "git": {
    "include_staged": false,
    "max_diff_lines": 1000
  }
}
```

## MCP Tools

### 1. `read_diff`

Read uncommitted git diff from the repository.

**Input:**
```json
{
  "staged": false,
  "path": "/path/to/repo"
}
```

**Output:**
```json
{
  "diff": "...",
  "file_count": 3,
  "files": ["src/index.ts", "src/utils.ts", "package.json"]
}
```

### 2. `run_agent`

Run a single CLI-based LLM agent with a prompt.

**Input:**
```json
{
  "agent": "codex",
  "prompt": "Review this code for bugs",
  "context": "optional context"
}
```

**Output:**
```json
{
  "output": "Agent's response...",
  "exit_code": 0,
  "duration_ms": 5000
}
```

### 3. `debate_review`

Run both agents on uncommitted changes and produce a final judged output.

**Input:**
```json
{
  "question": "Review this code for bugs and security issues",
  "includeCritique": true,
  "path": "/path/to/repo"
}
```

**Output:**
```json
{
  "winner": "claude",
  "codex_output": "...",
  "claude_output": "...",
  "evaluation": {
    "score_codex": 23,
    "score_claude": 31,
    "breakdown_codex": {
      "clarity": 6,
      "concrete": 9,
      "hallucination": 0,
      "reproducible": 8
    },
    "breakdown_claude": {
      "clarity": 8,
      "concrete": 12,
      "hallucination": -5,
      "reproducible": 16
    },
    "reason": "Claude scored higher due to more concrete suggestions..."
  },
  "final_recommendation": "Merged recommendation..."
}
```

## Scoring System

The deterministic judge scores outputs based on:

| Criteria | Points | Max |
|----------|--------|-----|
| Clarity (numbered lists, headings, bullets) | +2 each | 10 |
| Concrete suggestions (code, file refs, line numbers) | +3 each | 15 |
| Hallucination (non-existent file refs) | -5 each | -25 |
| Reproducible steps (commands, step markers) | +4 each | 20 |

**Maximum possible score: 45**
**Minimum possible score: -25**

## Integration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "debate-reviewer": {
      "command": "node",
      "args": ["/path/to/debate-reviewer-mcp/dist/index.js"]
    }
  }
}
```

### Claude Code CLI

```bash
claude mcp add debate-reviewer -- node /path/to/debate-reviewer-mcp/dist/index.js
```

### VS Code (Cline/Continue)

Add to `.vscode/settings.json`:

```json
{
  "mcpServers": {
    "debate-reviewer": {
      "command": "node",
      "args": ["/path/to/debate-reviewer-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

## Testing

### MCP Inspector

```bash
# Test with MCP inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

### Direct Testing

```bash
# Run the server directly (will wait for MCP messages on stdin)
node dist/index.js
```

## Debate Pipeline

```
Step A: Gather Diff
├── Execute `git diff` for uncommitted changes
└── Parse files changed and diff content

Step B: Run Codex CLI
├── Format prompt with diff context
├── Execute codex binary
└── Capture stdout as output A

Step C: Run Claude Code CLI
├── Format prompt with diff context
├── Execute claude binary
└── Capture stdout as output B

Step D: Optional Critique Round
├── Run Codex: "Critique this review: {output B}"
├── Run Claude: "Critique this review: {output A}"
└── Append critiques to outputs

Step E: Deterministic Judge Scoring
├── Score clarity, concrete suggestions, hallucinations, reproducibility
└── Calculate total scores

Step F: Pick Winner
└── Compare total scores, declare winner

Step G: Generate Merged Recommendation
├── Extract key points from both outputs
├── Combine unique suggestions
└── Format as final recommendation
```

## Development

```bash
# Watch mode for development
pnpm dev

# Build
pnpm build

# Run server
pnpm start
```

## License

MIT
