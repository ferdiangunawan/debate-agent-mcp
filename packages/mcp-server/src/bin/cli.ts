#!/usr/bin/env node

/**
 * CLI entry point for debate-agent MCP server
 * 
 * Usage:
 *   debate-agent            - Start MCP server (default)
 *   debate-agent --version  - Show version
 *   debate-agent --help     - Show help
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

// Handle --version
if (args.includes("--version") || args.includes("-v")) {
    console.log("debate-agent-mcp v1.0.0");
    process.exit(0);
}

// Handle --help
if (args.includes("--help") || args.includes("-h")) {
    console.log(`
debate-agent-mcp - Multi-agent debate MCP server

Usage:
  debate-agent                Start MCP server (communicates via stdio)
  debate-agent --version, -v  Show version
  debate-agent --help, -h     Show this help

Configuration:
  Create a config.json or debate-agent.config.json in your project root:

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
    },
    "debate": {
      "default_agents": ["codex", "claude"],
      "include_critique_round": true
    }
  }

MCP Tools:
  - list_agents     List all configured agents
  - read_diff       Read git diff from repository
  - run_agent       Run a single agent with prompt
  - debate_review   Multi-agent P0/P1/P2 code review
  - debate_plan     Create structured debate plan

Examples:
  # Start server for MCP client
  debate-agent

  # Add to Claude CLI
  claude mcp add debate-agent -- debate-agent

  # Use with MCP Inspector
  npx @modelcontextprotocol/inspector debate-agent

Learn more: https://github.com/ferdiangunawan/debate-agent-mcp
`);
    process.exit(0);
}

// Start MCP server
const serverPath = join(__dirname, "..", "index.js");

const server = spawn("node", [serverPath], {
    stdio: "inherit",
    cwd: process.cwd(),
});

process.on("SIGINT", () => {
    server.kill();
    process.exit(0);
});

process.on("SIGTERM", () => {
    server.kill();
    process.exit(0);
});

server.on("error", (err) => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
});

server.on("close", (code) => {
    process.exit(code ?? 0);
});
