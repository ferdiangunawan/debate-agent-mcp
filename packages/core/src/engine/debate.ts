/**
 * Debate orchestration engine
 * Coordinates the full debate pipeline between N agents
 */

import type {
    DebateResult,
    DiffResult,
    AgentDebateOutput,
    AgentEvaluation,
    DebateOptions,
} from "../types.js";
import { readDiff } from "../tools/read-diff.js";
import { runAgentForReview, runAgentForCritique } from "../tools/run-agent.js";
import { scoreReviewOutput, parseReviewOutput, generateScoringReason } from "./judge.js";
import { generateMergedRecommendation } from "./merger.js";
import { getDebateConfig, getDefaultAgents, validateAndFilterAgents } from "../config.js";

/**
 * Run the full debate pipeline with N agents
 *
 * Steps:
 * A. Gather uncommitted diff
 * B. Run all agents in parallel with review prompt
 * C. Optional critique round (each agent critiques others)
 * D. Score all outputs with deterministic judge
 * E. Pick winner
 * F. Generate merged recommendation
 */
export async function runDebate(options: DebateOptions): Promise<DebateResult> {
    const config = getDebateConfig();
    const requestedAgents = options.agents || getDefaultAgents();
    const includeCritique = options.includeCritique ?? config.include_critique_round;
    const platform = options.platform || "general";

    // Validate agents exist and filter to healthy ones
    const { agents, warnings } = validateAndFilterAgents(requestedAgents, 2);

    // Log any warnings
    for (const warning of warnings) {
        console.error(`[Debate] Warning: ${warning}`);
    }

    if (agents.length < 2) {
        throw new Error(
            "At least 2 healthy agents are required for a debate. " +
            `Only ${agents.length} healthy agent(s) available from requested: ${requestedAgents.join(", ")}`
        );
    }

    // Step A: Gather uncommitted diff
    console.error("[Debate] Step A: Gathering git diff...");
    let diffResult: DiffResult;
    try {
        diffResult = await readDiff({ path: options.path });
    } catch (error) {
        throw new Error(`Failed to read git diff: ${error}`);
    }

    if (!diffResult.diff || diffResult.file_count === 0) {
        throw new Error("No uncommitted changes found. Please make some changes before running debate review.");
    }

    console.error(`[Debate] Found ${diffResult.file_count} files changed`);

    // Step B: Run all agents in parallel
    console.error(`[Debate] Step B: Running ${agents.length} agents in parallel...`);

    const agentResults = await Promise.all(
        agents.map(async (agent) => {
            try {
                const result = await runAgentForReview(agent, options.question, diffResult.diff, platform);
                console.error(`[Debate] ${agent} completed in ${result.duration_ms}ms`);
                return { agent, result };
            } catch (error) {
                console.error(`[Debate] ${agent} failed:`, error);
                return {
                    agent,
                    result: {
                        agent,
                        output: `Error running ${agent}: ${error instanceof Error ? error.message : String(error)}`,
                        exit_code: 1,
                        duration_ms: 0,
                    },
                };
            }
        })
    );

    // Parse review outputs
    const agentOutputs: AgentDebateOutput[] = agentResults.map(({ agent, result }) => ({
        agent,
        output: result.output,
        review: parseReviewOutput(result.output),
        score: { p0_findings: 0, p1_findings: 0, p2_findings: 0, false_positives: 0, concrete_fixes: 0, file_accuracy: 0, clarity: 0, total: 0 },
    }));

    // Step C: Optional critique round
    const agentCritiques: Record<string, string> = {};

    if (includeCritique) {
        console.error("[Debate] Step C: Running critique round...");

        const critiquePromises = agents.flatMap((agent, i) => {
            const otherAgents = agents.filter((_, j) => j !== i);
            return otherAgents.map(async (otherAgent) => {
                const otherOutput = agentOutputs.find((o) => o.agent === otherAgent);
                if (!otherOutput) return null;

                try {
                    const critique = await runAgentForCritique(
                        agent,
                        otherAgent,
                        otherOutput.output,
                        diffResult.diff,
                        platform
                    );
                    return { agent, targetAgent: otherAgent, critique: critique.output };
                } catch (error) {
                    console.error(`[Debate] Critique by ${agent} of ${otherAgent} failed:`, error);
                    return null;
                }
            });
        });

        const critiqueResults = await Promise.all(critiquePromises);

        for (const result of critiqueResults) {
            if (result) {
                const key = `${result.agent}_critiques_${result.targetAgent}`;
                agentCritiques[key] = result.critique;

                // Add critique to agent's output
                const agentOutput = agentOutputs.find((o) => o.agent === result.agent);
                if (agentOutput) {
                    agentOutput.critique = (agentOutput.critique || "") + `\n\nCritique of ${result.targetAgent}:\n${result.critique}`;
                }
            }
        }

        console.error("[Debate] Critique round completed");
    }

    // Step D: Score all outputs
    console.error("[Debate] Step D: Scoring outputs...");

    for (const agentOutput of agentOutputs) {
        agentOutput.score = scoreReviewOutput(agentOutput.review, diffResult.files);
        console.error(`[Debate] ${agentOutput.agent} score: ${agentOutput.score.total}`);
    }

    // Step E: Pick winner
    const sortedAgents = [...agentOutputs].sort((a, b) => b.score.total - a.score.total);
    const winner = sortedAgents[0].agent;

    console.error(`[Debate] Step E: Winner is ${winner}`);

    // Step F: Generate merged recommendation
    console.error("[Debate] Step F: Generating merged recommendation...");

    const { mergedFindings, residualRisks, openQuestions, recommendation } = generateMergedRecommendation({
        agentOutputs,
        winner,
        diffFiles: diffResult.files,
    });

    // Build evaluation
    const evaluations: AgentEvaluation[] = agentOutputs.map((ao) => ({
        agent: ao.agent,
        score: ao.score,
        review: ao.review,
    }));

    const reason = generateScoringReason(evaluations);

    return {
        winner,
        agent_outputs: Object.fromEntries(agentOutputs.map((ao) => [ao.agent, ao.output])),
        agent_critiques: Object.keys(agentCritiques).length > 0 ? agentCritiques : undefined,
        evaluation: {
            agents: evaluations,
            winner,
            reason,
        },
        merged_findings: mergedFindings,
        residual_risks: residualRisks,
        open_questions: openQuestions,
        final_recommendation: recommendation,
    };
}

/**
 * Run debate with simplified options (backward compatible)
 */
export async function debateReview(
    question: string,
    path?: string
): Promise<DebateResult> {
    return runDebate({ question, path });
}
