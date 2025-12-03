#!/usr/bin/env node

/**
 * debate-reviewer-mcp - MCP server for agent debate between CLI-based LLM agents
 *
 * This server exposes three tools:
 * 1. read_diff - Read uncommitted git diff from a repository
 * 2. run_agent - Run a CLI-based LLM agent (Codex or Claude) with a prompt
 * 3. debate_review - Run both agents on uncommitted changes and produce a judged output
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { handleReadDiff } from "./tools/read-diff.js";
import { handleRunAgent } from "./tools/run-agent.js";
import { handleDebateReview } from "./tools/debate-review.js";

// Create MCP server
const server = new Server(
  {
    name: "debate-reviewer-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "read_diff",
      description:
        "Read uncommitted git diff from the repository. Returns the diff content, file count, and list of changed files.",
      inputSchema: {
        type: "object",
        properties: {
          staged: {
            type: "boolean",
            description:
              "If true, return only staged changes (git diff --cached). Default: false",
          },
          path: {
            type: "string",
            description:
              "Repository path. Defaults to current working directory.",
          },
        },
      },
    },
    {
      name: "run_agent",
      description:
        "Run a CLI-based LLM agent (Codex or Claude) with a prompt. Returns the agent's output, exit code, and execution duration.",
      inputSchema: {
        type: "object",
        properties: {
          agent: {
            type: "string",
            enum: ["codex", "claude"],
            description: "Which agent to run: 'codex' or 'claude'",
          },
          prompt: {
            type: "string",
            description: "The prompt to send to the agent",
          },
          context: {
            type: "string",
            description: "Optional context to include with the prompt",
          },
        },
        required: ["agent", "prompt"],
      },
    },
    {
      name: "debate_review",
      description:
        "Run both agents (Codex and Claude) on uncommitted changes and produce a final judged output. " +
        "The pipeline: (1) gather git diff, (2) run both agents, (3) optional critique round, " +
        "(4) score with deterministic rules, (5) pick winner, (6) generate merged recommendation.",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description:
              "The review question or request type (e.g., 'Review this code for bugs and security issues')",
          },
          includeCritique: {
            type: "boolean",
            description:
              "Whether to include a critique round where agents critique each other. Default: true",
          },
          path: {
            type: "string",
            description: "Repository path. Defaults to current working directory.",
          },
        },
        required: ["question"],
      },
    },
  ],
}));

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "read_diff":
        return await handleReadDiff(args ?? {});

      case "run_agent":
        return await handleRunAgent(args ?? {});

      case "debate_review":
        return await handleDebateReview(args ?? {});

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Main entry point
async function main() {
  const transport = new StdioServerTransport();

  console.error("[debate-reviewer-mcp] Starting MCP server...");

  await server.connect(transport);

  console.error("[debate-reviewer-mcp] Server connected and ready");
}

main().catch((error) => {
  console.error("[debate-reviewer-mcp] Fatal error:", error);
  process.exit(1);
});
