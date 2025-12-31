/**
 * Run agent tool - executes CLI-based LLM agents
 */

import { spawn, ChildProcess } from "child_process";
import type { RunAgentInput, AgentResult, Platform, RetryConfig } from "../types.js";
import { getAgentConfig, getDebateConfig } from "../config.js";
import { buildReviewPrompt, buildCritiquePrompt } from "../prompts/review-template.js";

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 15000,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateBackoff(attempt: number, config: RetryConfig): number {
    const delay = config.baseDelayMs * Math.pow(2, attempt);
    // Add jitter (±20%) to prevent thundering herd
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.min(delay + jitter, config.maxDelayMs);
}

/**
 * Forcefully kill a child process with escalation
 */
function killWithEscalation(child: ChildProcess, agentName: string): void {
    if (child.exitCode !== null) {
        return;
    }

    const pid = child.pid;
    if (!pid) {
        return;
    }

    // First try SIGTERM
    child.kill("SIGTERM");
    console.error(`[Agent] Sending SIGTERM to ${agentName}`);

    // Escalate to SIGKILL after 5 seconds if still running
    setTimeout(() => {
        if (child.exitCode === null) {
            try {
                process.kill(pid, 0);
            } catch {
                return;
            }
            console.error(`[Agent] Escalating to SIGKILL for ${agentName}`);
            child.kill("SIGKILL");
        }
    }, 5000);
}

/**
 * Run a CLI-based LLM agent with the given prompt (single attempt)
 */
async function runAgentOnce(input: RunAgentInput): Promise<AgentResult> {
    const agentConfig = getAgentConfig(input.agent);
    const debateConfig = getDebateConfig();
    const startTime = Date.now();

    // Build the full prompt with context
    const fullPrompt = input.context
        ? `Context:\n${input.context}\n\nQuestion:\n${input.prompt}`
        : input.prompt;

    return new Promise((resolve, reject) => {
        const args = [...agentConfig.args, fullPrompt];

        // Note: Don't use spawn's timeout option - it's unreliable
        // We handle timeout manually below
        const child = spawn(agentConfig.path, args, {
            stdio: ["pipe", "pipe", "pipe"],
        });

        child.stdin.end();

        let stdout = "";
        let stderr = "";
        let isResolved = false;

        child.stdout.on("data", (data: Buffer) => {
            stdout += data.toString();
        });

        child.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
        });

        const timeoutMs = agentConfig.timeout_seconds * 1000;
        const timeout = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                killWithEscalation(child, input.agent);
                reject(
                    new Error(
                        `Agent ${input.agent} timed out after ${agentConfig.timeout_seconds} seconds`
                    )
                );
            }
        }, timeoutMs);

        child.on("close", (code) => {
            if (!isResolved) {
                isResolved = true;
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
            }
        });

        child.on("error", (error) => {
            if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                reject(
                    new Error(`Failed to run agent ${input.agent}: ${error.message}`)
                );
            }
        });
    });
}

/**
 * Check if an error is retryable (timeout or transient)
 */
function isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Timeout errors are retryable
    if (message.includes("timed out")) return true;

    // Transient system errors are retryable
    if (message.includes("econnreset")) return true;
    if (message.includes("econnrefused")) return true;
    if (message.includes("etimedout")) return true;
    if (message.includes("epipe")) return true;

    // Non-retryable: ENOENT (binary not found), EACCES (permission denied)
    if (message.includes("enoent")) return false;
    if (message.includes("eacces")) return false;
    if (message.includes("spawn")) return false; // spawn errors are usually not transient

    // Default: don't retry unknown errors
    return false;
}

/**
 * Run a CLI-based LLM agent with retry logic
 *
 * Honors per-agent retry configuration from AgentConfig.retry.
 * Only retries on timeout or transient errors (not on ENOENT, EACCES, etc.).
 * Set maxRetries: 0 to disable retries entirely.
 */
export async function runAgent(
    input: RunAgentInput,
    overrideRetryConfig?: RetryConfig
): Promise<AgentResult> {
    // Get agent config to check for per-agent retry settings
    const agentConfig = getAgentConfig(input.agent);

    // Priority: override > agent config > default
    const retryConfig = overrideRetryConfig ?? agentConfig.retry ?? DEFAULT_RETRY_CONFIG;

    // If maxRetries is 0, don't retry at all
    if (retryConfig.maxRetries === 0) {
        return await runAgentOnce(input);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.error(`[Agent] Retry attempt ${attempt}/${retryConfig.maxRetries} for ${input.agent}`);
            }
            return await runAgentOnce(input);
        } catch (error) {
            lastError = error as Error;
            console.error(`[Agent] ${input.agent} failed (attempt ${attempt + 1}): ${lastError.message}`);

            // Only retry on timeout or transient errors
            if (!isRetryableError(lastError)) {
                console.error(`[Agent] Error is not retryable, giving up immediately`);
                throw lastError;
            }

            // Retry if we have attempts left
            if (attempt < retryConfig.maxRetries) {
                const delay = calculateBackoff(attempt, retryConfig);
                console.error(`[Agent] Retrying ${input.agent} in ${Math.round(delay)}ms...`);
                await sleep(delay);
            }
        }
    }

    throw lastError ?? new Error(`Agent ${input.agent} failed after ${retryConfig.maxRetries + 1} attempts`);
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
