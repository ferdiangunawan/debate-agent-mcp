#!/usr/bin/env node

/**
 * @debate-agent/mcp-server
 * 
 * MCP server for multi-agent debate with P0/P1/P2 code review and debate planning.
 *
 * This server exposes five tools:
 * 1. read_diff - Read uncommitted git diff from a repository
 * 2. run_agent - Run any configured CLI-based LLM agent with a prompt
 * 3. debate_review - Run N agents on uncommitted changes with P0/P1/P2 output
 * 4. debate_plan - Create a structured debate plan for N agents
 * 5. list_agents - List all configured agents
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
    getAgentNames,
    getAllAgents,
    getDefaultAgents,
    runDebate,
    createDebatePlan,
    formatDebatePlan,
    readDiff,
    runAgent,
} from "@debate-agent/core";

import type {
    DebateReviewInput,
    DebatePlanInput,
    ReadDiffInput,
    RunAgentInput,
    Platform,
    DebateMode,
} from "@debate-agent/core";

// Package version
const VERSION = "1.0.0";

// Create MCP server
const server = new Server(
    {
        name: "debate-agent-mcp",
        version: VERSION,
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
    const agentNames = getAgentNames();

    return {
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
                description: `Run a CLI-based LLM agent with a prompt. Available agents: ${agentNames.join(", ")}. Returns the agent's output, exit code, and execution duration.`,
                inputSchema: {
                    type: "object",
                    properties: {
                        agent: {
                            type: "string",
                            enum: agentNames,
                            description: `Which agent to run. Available: ${agentNames.join(", ")}`,
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
                    "Run multiple agents on uncommitted changes and produce a P0/P1/P2 severity-based code review. " +
                    "Pipeline: (1) gather git diff, (2) run all agents in parallel, (3) optional critique round, " +
                    "(4) score with deterministic rules, (5) pick winner, (6) generate merged findings with severity levels.",
                inputSchema: {
                    type: "object",
                    properties: {
                        question: {
                            type: "string",
                            description:
                                "The review question or request (e.g., 'Review this code for bugs and security issues')",
                        },
                        agents: {
                            type: "array",
                            items: { type: "string", enum: agentNames },
                            description: `Agents to participate in debate. Default: all configured agents. Available: ${agentNames.join(", ")}`,
                        },
                        includeCritique: {
                            type: "boolean",
                            description:
                                "Whether to include a critique round where agents critique each other. Default: true",
                        },
                        path: {
                            type: "string",
                            description:
                                "Repository path. Defaults to current working directory.",
                        },
                        platform: {
                            type: "string",
                            enum: ["flutter", "android", "ios", "backend", "general"],
                            description:
                                "Platform for specialized scrutiny rules. Default: general",
                        },
                    },
                    required: ["question"],
                },
            },
            {
                name: "debate_plan",
                description:
                    "Create a structured debate plan for multiple agents. " +
                    "Defines phases, agent roles, and scoring criteria for the debate.",
                inputSchema: {
                    type: "object",
                    properties: {
                        topic: {
                            type: "string",
                            description: "The topic or question for the debate",
                        },
                        agents: {
                            type: "array",
                            items: { type: "string", enum: agentNames },
                            description: `Agents to participate. Available: ${agentNames.join(", ")}`,
                        },
                        mode: {
                            type: "string",
                            enum: ["consensus", "adversarial", "collaborative"],
                            description:
                                "Debate mode. 'adversarial': agents challenge each other, 'consensus': find common ground, 'collaborative': build on ideas. Default: adversarial",
                        },
                        rounds: {
                            type: "number",
                            description: "Number of debate rounds (1-5). Default: 2",
                            minimum: 1,
                            maximum: 5,
                        },
                    },
                    required: ["topic"],
                },
            },
            {
                name: "list_agents",
                description:
                    "List all configured agents with their paths, timeouts, and default status.",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
        ],
    };
});

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

            case "debate_plan":
                return await handleDebatePlan(args ?? {});

            case "list_agents":
                return await handleListAgents();

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

// Tool handlers
async function handleReadDiff(args: Record<string, unknown>) {
    const input: ReadDiffInput = {
        staged: args.staged as boolean | undefined,
        path: args.path as string | undefined,
    };

    const result = await readDiff(input);

    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
            },
        ],
    };
}

async function handleRunAgent(args: Record<string, unknown>) {
    const input: RunAgentInput = {
        agent: args.agent as string,
        prompt: args.prompt as string,
        context: args.context as string | undefined,
    };

    const availableAgents = getAgentNames();

    if (!input.agent || !availableAgents.includes(input.agent)) {
        throw new Error(
            `Invalid agent "${input.agent}". Available: ${availableAgents.join(", ")}`
        );
    }

    if (!input.prompt) {
        throw new Error("Prompt is required");
    }

    const result = await runAgent(input);

    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
            },
        ],
    };
}

async function handleDebateReview(args: Record<string, unknown>) {
    const input: DebateReviewInput = {
        question: args.question as string,
        agents: args.agents as string[] | undefined,
        includeCritique: args.includeCritique as boolean | undefined,
        path: args.path as string | undefined,
        platform: args.platform as Platform | undefined,
    };

    if (!input.question) {
        throw new Error("Question is required for debate review");
    }

    // Validate agents if provided
    if (input.agents) {
        const availableAgents = getAgentNames();
        for (const agent of input.agents) {
            if (!availableAgents.includes(agent)) {
                throw new Error(
                    `Agent "${agent}" not found. Available: ${availableAgents.join(", ")}`
                );
            }
        }
    }

    const result = await runDebate({
        question: input.question,
        agents: input.agents,
        includeCritique: input.includeCritique,
        path: input.path,
        platform: input.platform,
    });

    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
            },
        ],
    };
}

async function handleDebatePlan(args: Record<string, unknown>) {
    const input: DebatePlanInput = {
        topic: args.topic as string,
        agents: (args.agents as string[]) || getDefaultAgents(),
        mode: (args.mode as DebateMode) || "adversarial",
        rounds: (args.rounds as number) || 2,
    };

    if (!input.topic) {
        throw new Error("Topic is required for debate plan");
    }

    // Validate agents
    const availableAgents = getAgentNames();
    for (const agent of input.agents) {
        if (!availableAgents.includes(agent)) {
            throw new Error(`Agent "${agent}" not found. Available: ${availableAgents.join(", ")}`);
        }
    }

    const plan = createDebatePlan(
        input.topic,
        input.agents,
        input.mode,
        input.rounds
    );

    // Return both JSON and formatted versions
    const result = {
        plan,
        formatted: formatDebatePlan(plan),
    };

    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
            },
        ],
    };
}

async function handleListAgents() {
    const agents = getAllAgents();
    const defaultAgents = getDefaultAgents();

    const result = {
        agents: Object.values(agents).map((agent) => ({
            name: agent.name,
            path: agent.path,
            timeout_seconds: agent.timeout_seconds,
            is_default: defaultAgents.includes(agent.name),
        })),
        default_agents: defaultAgents,
        total: Object.keys(agents).length,
    };

    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
            },
        ],
    };
}

// Main entry point
async function main() {
    const transport = new StdioServerTransport();

    console.error(`[debate-agent-mcp] Starting MCP server v${VERSION}...`);
    console.error(`[debate-agent-mcp] Available agents: ${getAgentNames().join(", ")}`);

    await server.connect(transport);

    console.error("[debate-agent-mcp] Server connected and ready");
}

main().catch((error) => {
    console.error("[debate-agent-mcp] Fatal error:", error);
    process.exit(1);
});

// Export for programmatic use
export { server };
