/**
 * 360 Debate Engine
 *
 * Orchestrates the full 360-degree multi-round debate pipeline:
 * 1. Parallel initial review
 * 2. 360 cross-review until confidence threshold
 * 3. Winner composes final result
 * 4. Others validate
 * 5. Write comprehensive report
 *
 * Supports two modes:
 * - "review": P0/P1/P2 code review (default)
 * - "plan": Implementation planning with consensus
 */

import type {
    Debate360Options,
    Debate360Result,
    Plan360Result,
    DebateRound,
    DebateProgress,
    DiffResult,
    AgentDebateOutput,
    CritiqueResult,
    FindingVote,
    Platform,
    ScoreBreakdown,
} from "../types.js";

import { readDiff } from "../tools/read-diff.js";
import { runAgentForReview, runAgentForCritique } from "../tools/run-agent.js";
import { scoreReviewOutput, parseReviewOutput } from "./judge.js";
import {
    calculateConfidence,
    buildAgreementMatrix,
    getAgreedFindings,
} from "./confidence.js";
import { runWinnerComposition, runValidation } from "./validator.js";
import { writeDebateReport, writePlanReport } from "./reporter.js";
import { getDefaultAgents, validateAndFilterAgents } from "../config.js";
import { runPlanDebate360 } from "./plan-debate360.js";

// Default configuration
const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_CONFIDENCE_THRESHOLD = 80;

/**
 * Log progress to stderr (MCP-compatible)
 */
function logProgress(progress: DebateProgress): void {
    const { phase, round, totalRounds, agent, targetAgent, confidence, completedAgents, totalAgents } = progress;

    let message = `[360 Debate] `;

    switch (phase) {
        case "initializing":
            message += `Initializing debate...`;
            break;
        case "parallel_review":
            message += `Round ${round}/${totalRounds} - Parallel review (${completedAgents}/${totalAgents} agents)`;
            if (agent) message += ` - ${agent}`;
            break;
        case "360_critique":
            message += `Round ${round}/${totalRounds} - 360 cross-review`;
            if (agent && targetAgent) {
                message += ` - ${agent} reviewing ${targetAgent}`;
            }
            message += ` (${completedAgents}/${totalAgents})`;
            break;
        case "scoring":
            message += `Round ${round}/${totalRounds} - Scoring outputs`;
            if (confidence !== undefined) {
                message += ` - Confidence: ${confidence}%`;
            }
            break;
        case "composing":
            message += `Winner ${agent} composing final result...`;
            break;
        case "validating":
            message += `Validation: ${agent} voting (${completedAgents}/${totalAgents})`;
            break;
        case "writing_report":
            message += `Writing report to .debate/...`;
            break;
    }

    console.error(message);
}

/**
 * Check if an agent output is valid (not error/timeout/empty)
 */
function isValidAgentOutput(output: AgentDebateOutput): boolean {
    // Check if output is an error message
    if (output.output.startsWith("Error:")) return false;
    // Check if review has any content
    if (output.review.findings.length === 0 &&
        output.review.residual_risks.length === 0 &&
        output.review.open_questions.length === 0 &&
        output.review.raw_output.length < 50) return false;
    return true;
}

/**
 * Run parallel initial review with all agents
 */
async function runParallelReview(
    agents: string[],
    question: string,
    diff: string,
    platform: Platform,
    round: number,
    maxRounds: number,
    onProgress?: (p: DebateProgress) => void
): Promise<AgentDebateOutput[]> {
    const outputs: AgentDebateOutput[] = [];
    let completed = 0;

    const progress: DebateProgress = {
        phase: "parallel_review",
        round,
        totalRounds: maxRounds,
        action: "Running parallel review",
        completedAgents: 0,
        totalAgents: agents.length,
    };

    logProgress(progress);
    onProgress?.(progress);

    const results = await Promise.all(
        agents.map(async (agent) => {
            try {
                const result = await runAgentForReview(agent, question, diff, platform);
                const review = parseReviewOutput(result.output);

                completed++;
                const updateProgress: DebateProgress = {
                    ...progress,
                    agent,
                    completedAgents: completed,
                    action: `${agent} completed`,
                };
                logProgress(updateProgress);
                onProgress?.(updateProgress);

                return {
                    agent,
                    output: result.output,
                    review,
                    score: { p0_findings: 0, p1_findings: 0, p2_findings: 0, false_positives: 0, concrete_fixes: 0, file_accuracy: 0, clarity: 0, total: 0 },
                    failed: false,
                };
            } catch (error) {
                console.error(`[360 Debate] ${agent} failed:`, error);
                completed++;
                return {
                    agent,
                    output: `Error: ${error instanceof Error ? error.message : String(error)}`,
                    review: { findings: [], residual_risks: [], open_questions: [], raw_output: "" },
                    score: { p0_findings: 0, p1_findings: 0, p2_findings: 0, false_positives: 0, concrete_fixes: 0, file_accuracy: 0, clarity: 0, total: 0 },
                    failed: true,
                };
            }
        })
    );

    outputs.push(...results);
    return outputs;
}

/**
 * Parse critique output to extract votes
 */
function parseCritiqueVotes(output: string, targetReview: AgentDebateOutput): FindingVote[] {
    const votes: FindingVote[] = [];

    try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return votes;

        const parsed = JSON.parse(jsonMatch[0]);

        // Check correct_points for agreements
        if (Array.isArray(parsed.correct_points)) {
            for (const point of parsed.correct_points) {
                // Try to match to a finding
                for (const finding of targetReview.review.findings) {
                    if (String(point).toLowerCase().includes(finding.title.toLowerCase().slice(0, 20))) {
                        votes.push({
                            findingId: `${finding.severity}_${finding.title.slice(0, 30)}`,
                            findingTitle: finding.title,
                            vote: "agree",
                            reason: String(point),
                        });
                        break;
                    }
                }
            }
        }

        // Check incorrect_points for disagreements
        if (Array.isArray(parsed.incorrect_points)) {
            for (const point of parsed.incorrect_points) {
                for (const finding of targetReview.review.findings) {
                    if (String(point).toLowerCase().includes(finding.title.toLowerCase().slice(0, 20))) {
                        votes.push({
                            findingId: `${finding.severity}_${finding.title.slice(0, 30)}`,
                            findingTitle: finding.title,
                            vote: "disagree",
                            reason: String(point),
                        });
                        break;
                    }
                }
            }
        }
    } catch {
        // If parsing fails, return empty votes
    }

    return votes;
}

/**
 * Run 360 cross-review where each agent critiques all others
 */
async function run360Critique(
    agentOutputs: AgentDebateOutput[],
    diff: string,
    platform: Platform,
    round: number,
    maxRounds: number,
    onProgress?: (p: DebateProgress) => void
): Promise<CritiqueResult[]> {
    const critiques: CritiqueResult[] = [];
    const agents = agentOutputs.map(o => o.agent);

    // Calculate total critique pairs
    const totalPairs = agents.length * (agents.length - 1);
    let completed = 0;

    const progress: DebateProgress = {
        phase: "360_critique",
        round,
        totalRounds: maxRounds,
        action: "Running 360 cross-review",
        completedAgents: 0,
        totalAgents: totalPairs,
    };

    logProgress(progress);
    onProgress?.(progress);

    // Create all critique pairs
    const critiquePairs: { reviewer: string; target: string; targetOutput: AgentDebateOutput }[] = [];

    for (const reviewer of agents) {
        for (const target of agents) {
            if (reviewer !== target) {
                const targetOutput = agentOutputs.find(o => o.agent === target);
                if (targetOutput) {
                    critiquePairs.push({ reviewer, target, targetOutput });
                }
            }
        }
    }

    // Run critiques in parallel
    const critiqueResults = await Promise.all(
        critiquePairs.map(async ({ reviewer, target, targetOutput }) => {
            const startTime = Date.now();

            try {
                const result = await runAgentForCritique(
                    reviewer,
                    target,
                    targetOutput.output,
                    diff,
                    platform
                );

                const votes = parseCritiqueVotes(result.output, targetOutput);

                completed++;
                const updateProgress: DebateProgress = {
                    ...progress,
                    agent: reviewer,
                    targetAgent: target,
                    completedAgents: completed,
                    action: `${reviewer} critiqued ${target}`,
                };
                logProgress(updateProgress);
                onProgress?.(updateProgress);

                return {
                    reviewer,
                    target,
                    critique: result.output,
                    votes,
                    duration_ms: Date.now() - startTime,
                };
            } catch (error) {
                console.error(`[360 Debate] Critique ${reviewer} -> ${target} failed:`, error);
                completed++;
                return {
                    reviewer,
                    target,
                    critique: `Error: ${error instanceof Error ? error.message : String(error)}`,
                    votes: [],
                    duration_ms: Date.now() - startTime,
                };
            }
        })
    );

    critiques.push(...critiqueResults);
    return critiques;
}

/**
 * Score all agent outputs and calculate round results
 */
function scoreRound(
    agentOutputs: AgentDebateOutput[],
    diffFiles: string[]
): Record<string, ScoreBreakdown> {
    const scores: Record<string, ScoreBreakdown> = {};

    for (const output of agentOutputs) {
        const score = scoreReviewOutput(output.review, diffFiles);
        output.score = score;
        scores[output.agent] = score;
    }

    return scores;
}

/**
 * Determine winner by highest score
 */
function determineWinner(scores: Record<string, ScoreBreakdown>): string {
    let winner = "";
    let highestScore = -Infinity;

    for (const [agent, score] of Object.entries(scores)) {
        if (score.total > highestScore) {
            highestScore = score.total;
            winner = agent;
        }
    }

    return winner;
}

/**
 * Run the full 360 debate pipeline
 *
 * Supports two modes:
 * - "review" (default): P0/P1/P2 code review
 * - "plan": Implementation planning with consensus
 */
export async function runDebate360(options: Debate360Options): Promise<Debate360Result | Plan360Result> {
    const mode = options.mode || "review";

    // Branch to plan mode if requested
    if (mode === "plan") {
        const planResult = await runPlanDebate360(options);

        // Write plan report
        const reportPath = writePlanReport({
            result: planResult,
            question: options.question,
            agents: options.agents || getDefaultAgents(),
            outputDir: options.path ? `${options.path}/.debate` : ".debate",
        });

        planResult.reportPath = reportPath;
        console.error(`[360 Plan] Report: ${reportPath}`);

        return planResult;
    }

    // Review mode (default)
    return runReviewDebate360(options);
}

/**
 * Build a single-agent result when only one agent is available
 * This provides graceful degradation instead of failing
 */
function buildSingleAgentResult(
    agentOutput: AgentDebateOutput,
    question: string,
    diffResult: DiffResult,
    startTime: number,
    outputDir: string
): Debate360Result {
    console.error(`[360 Debate] Running in single-agent mode (no cross-review)`);

    const score = scoreReviewOutput(agentOutput.review, diffResult.files);
    agentOutput.score = score;

    const result: Debate360Result = {
        winner: agentOutput.agent,
        rounds: [{
            round: 1,
            reviews: [agentOutput],
            critiques: [],
            scores: { [agentOutput.agent]: score },
            confidence: 50, // Low confidence for single-agent mode
            agreementMatrix: {},
        }],
        composed: {
            composer: agentOutput.agent,
            proposedFindings: agentOutput.review.findings,
            eliminatedFindings: [],
            eliminationReasons: {},
            residualRisks: agentOutput.review.residual_risks,
            openQuestions: agentOutput.review.open_questions,
            rawOutput: agentOutput.output,
        },
        validation: {
            votes: [],
            approvedFindings: agentOutput.review.findings,
            rejectedFindings: [],
            tieFindings: [],
        },
        finalFindings: agentOutput.review.findings,
        finalResidualRisks: [
            ...agentOutput.review.residual_risks,
            "⚠️ Single-agent mode: findings not cross-validated by other agents",
        ],
        finalOpenQuestions: agentOutput.review.open_questions,
        confidence: 50,
        reportPath: "",
        totalDuration_ms: Date.now() - startTime,
    };

    const reportPath = writeDebateReport({
        result,
        question,
        agents: [agentOutput.agent],
        outputDir,
    });

    result.reportPath = reportPath;
    console.error(`[360 Debate] Single-agent report: ${reportPath}`);

    return result;
}

/**
 * Run the review mode 360 debate pipeline (P0/P1/P2)
 */
async function runReviewDebate360(options: Debate360Options): Promise<Debate360Result> {
    const startTime = Date.now();

    // Configuration
    const requestedAgents = options.agents || getDefaultAgents();
    const maxRounds = options.maxRounds || DEFAULT_MAX_ROUNDS;
    const confidenceThreshold = options.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;
    const platform = options.platform || "general";
    const onProgress = options.onProgress;
    const outputDir = options.path ? `${options.path}/.debate` : ".debate";

    // Validate and filter to healthy agents only (with minimum of 1 for graceful degradation)
    const { agents, warnings } = validateAndFilterAgents(requestedAgents, 1);

    // Log any warnings
    for (const warning of warnings) {
        console.error(`[360 Debate] Warning: ${warning}`);
    }

    if (agents.length === 0) {
        throw new Error(
            "No healthy agents available. " +
            `Requested agents: ${requestedAgents.join(", ")}. ` +
            "Please check agent configuration and ensure binaries are accessible."
        );
    }

    const isSingleAgentMode = agents.length === 1;
    if (isSingleAgentMode) {
        console.error(`[360 Debate] Only 1 healthy agent available - running in single-agent mode`);
    }

    // Initialize
    const initProgress: DebateProgress = {
        phase: "initializing",
        round: 0,
        totalRounds: maxRounds,
        action: "Initializing debate",
        completedAgents: 0,
        totalAgents: agents.length,
    };
    logProgress(initProgress);
    onProgress?.(initProgress);

    // Step 1: Read git diff
    let diffResult: DiffResult;
    try {
        diffResult = await readDiff({ path: options.path });
    } catch (error) {
        throw new Error(`Failed to read git diff: ${error}`);
    }

    if (!diffResult.diff || diffResult.file_count === 0) {
        throw new Error("No uncommitted changes found. Make changes before running 360 debate.");
    }

    console.error(`[360 Debate] Found ${diffResult.file_count} files changed`);

    // Step 2: Run debate rounds until confidence threshold or max rounds
    const rounds: DebateRound[] = [];
    let currentRound = 0;
    let confidence = 0;
    let agentOutputs: AgentDebateOutput[] = [];

    // Initial parallel review
    currentRound = 1;
    agentOutputs = await runParallelReview(
        agents,
        options.question,
        diffResult.diff,
        platform,
        currentRound,
        maxRounds,
        onProgress
    );

    // Check how many agents produced valid output
    const workingAgents = agentOutputs.filter(isValidAgentOutput);
    const failedAgents = agentOutputs.filter(o => !isValidAgentOutput(o)).map(o => o.agent);

    if (failedAgents.length > 0) {
        console.error(`[360 Debate] Failed agents: ${failedAgents.join(", ")}`);
    }

    // Graceful degradation: if only one agent works, use single-agent mode
    if (workingAgents.length === 0) {
        throw new Error(
            "No agents produced valid output. " +
            `All ${agents.length} agent(s) failed. ` +
            "Check agent configuration, timeouts, and ensure agents are working."
        );
    }

    if (workingAgents.length === 1) {
        console.error(`[360 Debate] Only 1 agent produced valid output - falling back to single-agent mode`);
        return buildSingleAgentResult(
            workingAgents[0],
            options.question,
            diffResult,
            startTime,
            outputDir
        );
    }

    console.error(`[360 Debate] ${workingAgents.length}/${agents.length} agents produced valid output`);

    // Continue with only working agents for the debate
    agentOutputs = workingAgents;
    // 360 debate loop
    while (confidence < confidenceThreshold && currentRound <= maxRounds) {
        // Run 360 cross-review
        const critiques = await run360Critique(
            agentOutputs,
            diffResult.diff,
            platform,
            currentRound,
            maxRounds,
            onProgress
        );

        // Score outputs
        const scoringProgress: DebateProgress = {
            phase: "scoring",
            round: currentRound,
            totalRounds: maxRounds,
            action: "Scoring outputs",
            completedAgents: agents.length,
            totalAgents: agents.length,
        };
        logProgress(scoringProgress);
        onProgress?.(scoringProgress);

        const scores = scoreRound(agentOutputs, diffResult.files);

        // Calculate confidence
        const confidenceResult = calculateConfidence(agentOutputs, critiques, confidenceThreshold);
        confidence = confidenceResult.score;

        const confidenceProgress: DebateProgress = {
            ...scoringProgress,
            confidence,
            action: `Confidence: ${confidence}%`,
        };
        logProgress(confidenceProgress);
        onProgress?.(confidenceProgress);

        // Build agreement matrix
        const agreementMatrix = buildAgreementMatrix(agentOutputs, critiques);

        // Store round data
        rounds.push({
            round: currentRound,
            reviews: [...agentOutputs],
            critiques,
            scores,
            confidence,
            agreementMatrix,
        });

        // Check if we need another round
        if (confidence < confidenceThreshold && currentRound < maxRounds) {
            console.error(`[360 Debate] Confidence ${confidence}% < ${confidenceThreshold}% - Starting round ${currentRound + 1}`);
            currentRound++;

            // Re-run parallel review for fresh perspectives in new round
            agentOutputs = await runParallelReview(
                agents,
                options.question,
                diffResult.diff,
                platform,
                currentRound,
                maxRounds,
                onProgress
            );

            // Re-validate working agents
            const newWorkingAgents = agentOutputs.filter(isValidAgentOutput);
            if (newWorkingAgents.length < 2) {
                console.error(`[360 Debate] Warning: Only ${newWorkingAgents.length} agents working in round ${currentRound}`);

                if (newWorkingAgents.length === 0) {
                    throw new Error(`All agents failed in round ${currentRound}`);
                }

                // If we've fallen to single agent mid-debate, return single-agent result immediately
                // This avoids inconsistent state in validation phase which expects 2+ agents
                if (newWorkingAgents.length === 1) {
                    console.error(`[360 Debate] Falling back to single-agent mode mid-debate`);
                    return buildSingleAgentResult(
                        newWorkingAgents[0],
                        options.question,
                        diffResult,
                        startTime,
                        outputDir
                    );
                }
            }
            agentOutputs = newWorkingAgents;
        } else {
            break;
        }
    }

    console.error(`[360 Debate] Debate complete after ${currentRound} round(s) with ${confidence}% confidence`);

    // Step 3: Determine winner
    const lastRound = rounds[rounds.length - 1];
    const winner = determineWinner(lastRound.scores);
    console.error(`[360 Debate] Winner: ${winner.toUpperCase()}`);

    // Step 4: Winner composes final result
    const composingProgress: DebateProgress = {
        phase: "composing",
        round: currentRound,
        totalRounds: maxRounds,
        agent: winner,
        action: `${winner} composing final result`,
        completedAgents: 0,
        totalAgents: 1,
    };
    logProgress(composingProgress);
    onProgress?.(composingProgress);

    const composed = await runWinnerComposition(winner, rounds, diffResult.diff);

    // Step 5: Others validate
    const validators = agents.filter(a => a !== winner);
    if (validators.length > 0) {
        const validationProgress: DebateProgress = {
            phase: "validating",
            round: currentRound,
            totalRounds: maxRounds,
            action: "Running validation",
            completedAgents: 0,
            totalAgents: validators.length,
        };
        logProgress(validationProgress);
        onProgress?.(validationProgress);
    }

    const validation = await runValidation(
        composed.proposedFindings,
        validators,
        winner,
        diffResult.diff
    );

    // Step 6: Compile final result
    const finalFindings = validation.approvedFindings;
    const finalResidualRisks = [
        ...composed.residualRisks,
        ...getAgreedFindings(agentOutputs, lastRound.critiques)
            .filter(f => !finalFindings.some(ff => ff.title === f.title))
            .map(f => `Disputed: ${f.title}`)
    ].slice(0, 10);
    const finalOpenQuestions = composed.openQuestions;

    // Step 7: Write report
    const reportProgress: DebateProgress = {
        phase: "writing_report",
        round: currentRound,
        totalRounds: maxRounds,
        action: "Writing report",
        completedAgents: agents.length,
        totalAgents: agents.length,
    };
    logProgress(reportProgress);
    onProgress?.(reportProgress);

    const result: Debate360Result = {
        winner,
        rounds,
        composed,
        validation,
        finalFindings,
        finalResidualRisks,
        finalOpenQuestions,
        confidence,
        reportPath: "",
        totalDuration_ms: Date.now() - startTime,
    };

    // Use the agents that actually participated (working agents only)
    const participatingAgents = agentOutputs.map(o => o.agent);

    const reportPath = writeDebateReport({
        result,
        question: options.question,
        agents: participatingAgents,
        outputDir,
    });

    result.reportPath = reportPath;

    console.error(`[360 Debate] Complete! Report: ${reportPath}`);
    console.error(`[360 Debate] Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    return result;
}

/**
 * Simplified API for 360 debate (backward compatible)
 * Note: Only supports review mode. Use runDebate360() for plan mode.
 */
export async function debate360(
    question: string,
    path?: string
): Promise<Debate360Result> {
    const result = await runDebate360({ question, path, mode: "review" });
    return result as Debate360Result;
}
