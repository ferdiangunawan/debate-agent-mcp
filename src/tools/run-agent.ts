/**
 * Run agent tool - executes CLI-based LLM agents
 */

import { spawn } from "child_process";
import type { RunAgentInput, AgentResult, AgentType } from "../types.js";
import { getAgentConfig, getDebateConfig } from "../config.js";

/**
 * Run a CLI-based LLM agent with the given prompt
 */
export async function runAgent(input: RunAgentInput): Promise<AgentResult> {
  const agentConfig = getAgentConfig(input.agent);
  const debateConfig = getDebateConfig();
  const startTime = Date.now();

  // Build the full prompt with context
  const fullPrompt = input.context
    ? `Context:\n${input.context}\n\nQuestion:\n${input.prompt}`
    : input.prompt;

  return new Promise((resolve, reject) => {
    // Build command arguments
    const args = [...agentConfig.args, fullPrompt];

    const child = spawn(agentConfig.path, args, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: agentConfig.timeout_seconds * 1000,
    });

    // Close stdin immediately - agents don't need interactive input
    child.stdin.end();

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // Set timeout
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          `Agent ${input.agent} timed out after ${agentConfig.timeout_seconds} seconds`
        )
      );
    }, agentConfig.timeout_seconds * 1000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      const duration_ms = Date.now() - startTime;

      // Truncate output if too long
      let output = stdout || stderr;
      if (output.length > debateConfig.max_output_length) {
        output =
          output.slice(0, debateConfig.max_output_length) +
          "\n\n... (output truncated)";
      }

      resolve({
        output,
        exit_code: code ?? 0,
        duration_ms,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        new Error(`Failed to run agent ${input.agent}: ${error.message}`)
      );
    });
  });
}

/**
 * Run agent with a specific prompt for code review
 */
export async function runAgentForReview(
  agent: AgentType,
  question: string,
  diff: string
): Promise<AgentResult> {
  const prompt = `You are reviewing code changes. Please analyze the following git diff and provide your review.

Question/Request: ${question}

Git Diff:
\`\`\`diff
${diff}
\`\`\`

Please provide:
1. A summary of the changes
2. Any potential issues or bugs
3. Suggestions for improvement
4. Code quality assessment

Be specific and reference line numbers or file names when possible.`;

  return runAgent({
    agent,
    prompt,
    context: diff,
  });
}

/**
 * Run agent to critique another agent's review
 */
export async function runAgentForCritique(
  agent: AgentType,
  otherAgentReview: string,
  diff: string
): Promise<AgentResult> {
  const otherAgent = agent === "codex" ? "claude" : "codex";

  const prompt = `You are reviewing another AI agent's code review. Please critique the following review and identify any issues, missed points, or incorrect assessments.

Original Diff:
\`\`\`diff
${diff}
\`\`\`

${otherAgent.toUpperCase()}'s Review:
${otherAgentReview}

Please provide:
1. Points where the review is correct
2. Points where the review is incorrect or misleading
3. Important issues that were missed
4. Overall assessment of the review quality

Be constructive and specific.`;

  return runAgent({
    agent,
    prompt,
  });
}

/**
 * Handle MCP tool call for run_agent
 */
export async function handleRunAgent(args: Record<string, unknown>) {
  const input: RunAgentInput = {
    agent: args.agent as AgentType,
    prompt: args.prompt as string,
    context: args.context as string | undefined,
  };

  if (!input.agent || !["codex", "claude"].includes(input.agent)) {
    throw new Error('Invalid agent. Must be "codex" or "claude"');
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
