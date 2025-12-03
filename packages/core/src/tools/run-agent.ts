/**
 * Run agent tool - executes CLI-based LLM agents
 */

import { spawn } from "child_process";
import type { RunAgentInput, AgentResult, Platform } from "../types.js";
import { getAgentConfig, getDebateConfig } from "../config.js";
import { buildReviewPrompt, buildCritiquePrompt } from "../prompts/review-template.js";

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
        const args = [...agentConfig.args, fullPrompt];

        const child = spawn(agentConfig.path, args, {
            stdio: ["pipe", "pipe", "pipe"],
            timeout: agentConfig.timeout_seconds * 1000,
        });

        child.stdin.end();

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data: Buffer) => {
            stdout += data.toString();
        });

        child.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
        });

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

            let output = stdout || stderr;
            if (output.length > debateConfig.max_output_length) {
                output =
                    output.slice(0, debateConfig.max_output_length) +
                    "\n\n... (output truncated)";
            }

            resolve({
                agent: input.agent,
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
 * Run agent with P0/P1/P2 review prompt
 */
export async function runAgentForReview(
    agent: string,
    question: string,
    diff: string,
    platform: Platform = "general"
): Promise<AgentResult> {
    const prompt = buildReviewPrompt(question, diff, platform);

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
    agent: string,
    targetAgent: string,
    targetReview: string,
    diff: string,
    platform: Platform = "general"
): Promise<AgentResult> {
    const prompt = buildCritiquePrompt(targetAgent, targetReview, diff, platform);

    return runAgent({
        agent,
        prompt,
    });
}
