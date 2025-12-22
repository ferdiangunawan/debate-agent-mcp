# Debate Agent MCP

> **EXPERIMENTAL**: This project is in active development. APIs and features may change without notice. Use at your own risk in production environments.

A multi-agent debate framework for **code review** and **debate planning** with P0/P1/P2 severity scoring.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEBATE AGENT MCP                                  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         MCP SERVER LAYER                              │  │
│  │                    (Model Context Protocol)                           │  │
│  │                                                                       │  │
│  │   Exposes tools via stdio to Claude Code / AI assistants:            │  │
│  │   • list_agents    • read_diff    • run_agent                        │  │
│  │   • debate_review  • debate_plan                                     │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      ORCHESTRATOR LAYER                               │  │
│  │                     (@debate-agent/core)                              │  │
│  │                                                                       │  │
│  │   Pipeline:                                                          │  │
│  │   1. Read git diff ──► 2. Run agents in parallel (Promise.all)       │  │
│  │   3. Critique round ──► 4. Deterministic scoring ──► 5. Merge        │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                    ┌───────────────┴───────────────┐                        │
│                    ▼                               ▼                        │
│  ┌──────────────────────────┐    ┌──────────────────────────┐              │
│  │      Claude CLI          │    │      Codex CLI           │              │
│  │  /opt/homebrew/bin/claude│    │  /opt/homebrew/bin/codex │              │
│  │                          │    │                          │              │
│  │  spawn() as subprocess   │    │  spawn() as subprocess   │              │
│  │  Uses YOUR credentials   │    │  Uses YOUR credentials   │              │
│  └──────────────────────────┘    └──────────────────────────┘              │
│                    │                               │                        │
│                    ▼                               ▼                        │
│              Anthropic API                   OpenAI API                     │
│           (auth via local CLI)            (auth via local CLI)              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## How It Works

### No Authentication Required

The MCP itself requires **no API keys or authentication**. It orchestrates your locally installed CLI tools:

```
┌─────────────────────────────────────────────────────────────────┐
│  YOUR MACHINE                                                   │
│                                                                 │
│  ~/.claude/credentials  ──► claude CLI ──► Anthropic API       │
│  ~/.codex/credentials   ──► codex CLI  ──► OpenAI API          │
│                                                                 │
│  The MCP just runs: spawn("claude", ["--print", prompt])        │
│  Same as typing in your terminal!                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Execution Flow

```
Step 1: Build Prompt
├── Combine review question + git diff + platform rules
├── Add P0/P1/P2 severity definitions
└── Request JSON output format

Step 2: Parallel Execution
├── spawn("/opt/homebrew/bin/claude", ["--print", prompt])
├── spawn("/opt/homebrew/bin/codex", ["exec", prompt])
└── Both run simultaneously via Promise.all()

Step 3: Capture Output
├── Read stdout from each CLI process
└── Parse JSON responses

Step 4: Deterministic Scoring (No AI)
├── Count P0/P1/P2 findings
├── Check file accuracy against diff
├── Penalize false positives
└── Score clarity and fix quality

Step 5: Merge & Report
├── Pick winner by highest score
├── Combine unique findings from all agents
└── Generate final recommendation
```

## 360 Debate Feature (v2.0)

The 360 Debate feature provides **multi-turn cross-review** with confidence scoring. It supports two modes:

| Mode | Description | Output |
|------|-------------|--------|
| **review** | P0/P1/P2 code review findings | `.debate/review-TIMESTAMP.md` |
| **plan** | Implementation planning with consensus | `.debate/plan-TIMESTAMP.md` |

### 360 Debate Pipeline

```
Round 1: Initial Review (Parallel)
┌─────────┐     ┌─────────┐
│ Claude  │     │ Codex   │
│ Review  │     │ Review  │
└────┬────┘     └────┬────┘
     │               │
     ▼               ▼
Round 2: 360 Cross-Review (Each agent reviews ALL others)
┌─────────────────────────────────────────┐
│ Claude reviews Codex's findings         │
│ Codex reviews Claude's findings         │
│ "Is P0 about null pointer valid?"       │
│ "Did Codex miss the SQL injection?"     │
└─────────────────────────────────────────┘
     │
     ▼
Confidence Check: >= 80%?
     │
     ├── No ──► Repeat (max 3 rounds)
     │
     ▼ Yes
Winner Composition
┌─────────────────────────────────────────┐
│ Highest scoring agent composes final    │
│ Merge valid findings, eliminate dupes   │
│ Document elimination reasons            │
└─────────────────────────────────────────┘
     │
     ▼
Validation Phase
┌─────────────────────────────────────────┐
│ Other agents vote: approve/reject       │
│ Majority approval required              │
│ Winner breaks ties                      │
└─────────────────────────────────────────┘
     │
     ▼
Final Report: .debate/review-*.md or .debate/plan-*.md
```

### Review Mode Example

```typescript
// Run 360 code review
const result = await runDebate360({
  question: 'Review this code for security issues',
  mode: 'review',  // P0/P1/P2 severity scoring
  agents: ['claude', 'codex'],
  platform: 'backend',
  maxRounds: 3,
  confidenceThreshold: 80,
});

// Output: .debate/review-2025-01-20T10-30-00.md
console.log(result.finalFindings);  // Validated P0/P1/P2 findings
```

### Plan Mode Example

```typescript
// Run 360 implementation planning
const result = await runDebate360({
  question: 'Plan how to add user authentication',
  mode: 'plan',  // Consensus-based, no severity
  agents: ['claude', 'codex'],
  maxRounds: 3,
  confidenceThreshold: 80,
});

// Output: .debate/plan-2025-01-20T10-30-00.md
console.log(result.finalPlan);  // Validated implementation steps
```

### Mode Comparison

| Aspect | Review Mode | Plan Mode |
|--------|-------------|-----------|
| **Purpose** | Find bugs, security issues | Plan implementation approach |
| **Scoring** | P0/P1/P2 severity (max 134 pts) | Clarity + Consensus (0-100) |
| **Output** | Findings with fix suggestions | Implementation steps with phases |
| **Winner** | Highest severity score | Highest consensus + clarity |
| **Final Result** | Merged P0/P1/P2 findings | Merged implementation plan |
| **MD File** | `review-TIMESTAMP.md` | `plan-TIMESTAMP.md` |

**Benefits of 360 Debate**:
- Eliminate hallucinated findings (validated by multiple agents)
- Catch missed issues (one agent finds what another missed)
- Build confidence scores (80% threshold ensures agreement)
- Reduce false positives (adversarial review catches incorrect assessments)
- Comprehensive report in `.debate/` directory

---

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@debate-agent/core`](./packages/core) | Core logic (framework-agnostic) | `npm i @debate-agent/core` |
| [`@debate-agent/mcp-server`](./packages/mcp-server) | MCP server for CLI users | `npm i -g @debate-agent/mcp-server` |
| [`debate-agent-mcp`](./packages/vscode-extension) | VS Code extension | Install from marketplace |

## Quick Start

### Prerequisites

You must have the agent CLIs installed and authenticated:

```bash
# Check Claude CLI
claude --version
claude auth status  # Should show logged in

# Check Codex CLI
codex --version
# Should be authenticated via OpenAI

# The MCP will spawn these - no additional auth needed
```

### For CLI Users

```bash
# Install globally
npm install -g @debate-agent/mcp-server

# Start MCP server
debate-agent

# Or run directly
npx @debate-agent/mcp-server
```

### For Claude Code

```bash
# Add MCP to Claude Code
claude mcp add debate-reviewer -- node /path/to/packages/mcp-server/dist/index.js

# Verify connection
claude mcp list
# Should show: debate-reviewer: ✓ Connected
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

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_agents` | List all configured agents |
| `read_diff` | Read uncommitted git diff |
| `run_agent` | Run a single agent with prompt |
| `debate_review` | Multi-agent P0/P1/P2 code review (single round) |
| `debate_plan` | Create structured debate plan |
| `debate_360` | **360 multi-round debate with modes: `review` (P0/P1/P2) or `plan` (consensus)** |

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

Defined in: `packages/core/src/prompts/review-template.ts`

## Platform-Specific Rules

| Platform | Focus Areas |
|----------|-------------|
| **flutter** | Async misuse, setState, dispose(), BuildContext in async, Riverpod leaks |
| **android** | Manifest, permissions, ProGuard, lifecycle violations, context leaks |
| **ios** | plist, ATS, keychain, signing, main thread UI, retain cycles |
| **backend** | DTO mismatch, HTTP codes, SQL injection, auth flaws, rate limiting |
| **general** | Null pointers, resource leaks, race conditions, XSS, input validation |

Defined in: `packages/core/src/prompts/platform-rules.ts`

## Scoring System

The scoring is **deterministic** (no AI) - pure rule-based evaluation:

| Criteria | Points | Max |
|----------|--------|-----|
| P0 Finding | +15 | 45 |
| P1 Finding | +8 | 32 |
| P2 Finding | +3 | 12 |
| False Positive | -10 | -30 |
| Concrete Fix | +5 | 25 |
| File Accuracy | +2 | 10 |
| Clarity | 0-10 | 10 |

**Maximum possible score**: 134
**Minimum possible score**: -30

Defined in: `packages/core/src/engine/judge.ts`

## Debate Modes

| Mode | Description |
|------|-------------|
| **adversarial** | Agents challenge each other's positions |
| **consensus** | Agents work to find common ground |
| **collaborative** | Agents build on each other's ideas |

## Project Structure

```
debate-agent-mcp/
├── packages/
│   ├── core/                       # @debate-agent/core
│   │   ├── src/
│   │   │   ├── engine/
│   │   │   │   ├── debate.ts       # Orchestration (parallel execution)
│   │   │   │   ├── judge.ts        # Deterministic scoring rules
│   │   │   │   ├── merger.ts       # Combine findings from agents
│   │   │   │   └── planner.ts      # Debate plan generation
│   │   │   ├── prompts/
│   │   │   │   ├── review-template.ts   # P0/P1/P2 definitions
│   │   │   │   └── platform-rules.ts    # Platform-specific scrutiny
│   │   │   ├── tools/
│   │   │   │   ├── read-diff.ts    # Git diff reader
│   │   │   │   └── run-agent.ts    # CLI spawner (spawn())
│   │   │   ├── config.ts           # Config loader
│   │   │   ├── types.ts            # TypeScript types
│   │   │   └── index.ts            # Public exports
│   │   └── package.json
│   │
│   ├── mcp-server/                 # @debate-agent/mcp-server
│   │   ├── src/
│   │   │   ├── index.ts            # MCP server (stdio transport)
│   │   │   └── bin/cli.ts          # CLI entry point
│   │   └── package.json
│   │
│   └── vscode-extension/           # debate-agent-mcp (VS Code)
│       ├── src/
│       │   └── extension.ts
│       └── package.json
│
├── debate-agent.config.json        # Example config
├── package.json                    # Monorepo root
├── pnpm-workspace.yaml
└── README.md
```

## Integration

### Claude Desktop

```json
{
  "mcpServers": {
    "debate-agent": {
      "command": "node",
      "args": ["/path/to/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Claude CLI

```bash
claude mcp add debate-agent -- node /path/to/packages/mcp-server/dist/index.js
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

## Known Limitations

- **Experimental**: APIs may change without notice
- **Local CLIs required**: You must have `claude` and `codex` CLIs installed and authenticated
- **Timeout risks**: Long diffs may cause agent timeouts (default 180s)
- **No streaming**: Currently waits for full response before processing
- **Minimum 2 agents**: 360 debate requires at least 2 agents for cross-review

## Contributing

Contributions welcome! Please open an issue first to discuss proposed changes.

## License

MIT
