/**
 * Plan Mode 360 Debate Engine
 *
 * Orchestrates the 360-degree multi-round debate for implementation planning:
 * 1. Parallel initial planning
 * 2. 360 cross-review until confidence threshold
 * 3. Winner composes final plan
 * 4. Others validate
 * 5. Write comprehensive report
 */

import type {
    Debate360Options,
    DebateProgress,
    DiffResult,
    PlanDebateOutput,
    PlanCritiqueResult,
    PlanStepVote,
    PlanRound,
    PlanScoreBreakdown,
    Plan360Result,
    ComposedPlanResult,
    PlanValidationResult,
    PlanValidationVote,
    PlanStep,
    Platform,
} from "../types.js";

import { readDiff } from "../tools/read-diff.js";
import { runAgent } from "../tools/run-agent.js";
import { buildPlanPrompt, buildPlanCritiquePrompt, buildPlanComposePrompt, buildPlanValidationPrompt } from "../prompts/plan-template.js";
import { scorePlanOutput, parsePlanOutput, createStepSignature, stepsMatch } from "./plan-judge.js";
import { getDefaultAgents, validateAgents } from "../config.js";

// Default configuration
const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_CONFIDENCE_THRESHOLD = 80;

/**
 * Log progress to stderr (MCP-compatible)
 */
function logProgress(progress: DebateProgress): void {
    const { phase, round, totalRounds, agent, targetAgent, confidence, completedAgents, totalAgents } = progress;

    let message = `[360 Plan] `;

    switch (phase) {
        case "initializing":
            message += `Initializing plan debate...`;
            break;
        case "parallel_review":
            message += `Round ${round}/${totalRounds} - Parallel planning (${completedAgents}/${totalAgents} agents)`;
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
            message += `Round ${round}/${totalRounds} - Scoring plans`;
            if (confidence !== undefined) {
                message += ` - Confidence: ${confidence}%`;
            }
            break;
        case "composing":
            message += `Winner ${agent} composing final plan...`;
            break;
        case "validating":
            message += `Validation: ${agent} voting (${completedAgents}/${totalAgents})`;
            break;
        case "writing_report":
            message += `Writing plan report to .debate/...`;
            break;
    }

    console.error(message);
}

/**
 * Check if a plan output is valid (not error/timeout/empty)
 */
function isValidPlanOutput(output: PlanDebateOutput): boolean {
    // Check if output is an error message
    if (output.output.startsWith("Error:")) return false;
    // Check if plan has any content
    if (output.plan.steps.length === 0 &&
        output.plan.summary.length < 20 &&
        output.plan.risks.length === 0 &&
        output.plan.raw_output.length < 50) return false;
    return true;
}

/**
 * Run parallel initial planning with all agents
 */
async function runParallelPlanning(
    agents: string[],
    question: string,
    context: string,
    platform: Platform,
    round: number,
    maxRounds: number,
    onProgress?: (p: DebateProgress) => void
): Promise<PlanDebateOutput[]> {
    const outputs: PlanDebateOutput[] = [];
    let completed = 0;

    const progress: DebateProgress = {
        phase: "parallel_review",
        round,
        totalRounds: maxRounds,
        action: "Running parallel planning",
        completedAgents: 0,
        totalAgents: agents.length,
    };

    logProgress(progress);
    onProgress?.(progress);

    const results = await Promise.all(
        agents.map(async (agent) => {
            try {
                const prompt = buildPlanPrompt(question, context, platform);
                const result = await runAgent({ agent, prompt });
                const plan = parsePlanOutput(result.output);

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
                    plan,
                    score: { clarity: 0, completeness: 0, feasibility: 0, consensus: 0, total: 0 },
                    failed: false,
                };
            } catch (error) {
                console.error(`[360 Plan] ${agent} failed:`, error);
                completed++;
                return {
                    agent,
                    output: `Error: ${error instanceof Error ? error.message : String(error)}`,
                    plan: { steps: [], summary: "", risks: [], open_questions: [], raw_output: "" },
                    score: { clarity: 0, completeness: 0, feasibility: 0, consensus: 0, total: 0 },
                    failed: true,
                };
            }
        })
    );

    outputs.push(...results);
    return outputs;
}

/**
 * Parse critique output to extract step votes
 */
function parsePlanCritiqueVotes(output: string, _targetPlan: PlanDebateOutput): PlanStepVote[] {
    const votes: PlanStepVote[] = [];

    try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return votes;

        const parsed = JSON.parse(jsonMatch[0]);

        // Parse step_reviews
        if (Array.isArray(parsed.step_reviews)) {
            for (const review of parsed.step_reviews) {
                const stepTitle = String(review.step_title || "");
                const phase = typeof review.phase === "number" ? review.phase : 1;
                const vote = review.vote === "disagree" ? "disagree" :
                    review.vote === "modify" ? "modify" : "agree";

                votes.push({
                    stepTitle,
                    phase,
                    vote,
                    reason: review.reason ? String(review.reason) : undefined,
                    suggestion: review.suggestion ? String(review.suggestion) : undefined,
                });
            }
        }
    } catch {
        // If parsing fails, return empty votes
    }

    return votes;
}

/**
 * Run 360 cross-review where each agent critiques all others' plans
 */
async function run360PlanCritique(
    planOutputs: PlanDebateOutput[],
    diff: string,
    platform: Platform,
    round: number,
    maxRounds: number,
    onProgress?: (p: DebateProgress) => void
): Promise<PlanCritiqueResult[]> {
    const critiques: PlanCritiqueResult[] = [];
    const agents = planOutputs.map(o => o.agent);

    // Calculate total critique pairs
    const totalPairs = agents.length * (agents.length - 1);
    let completed = 0;

    const progress: DebateProgress = {
        phase: "360_critique",
        round,
        totalRounds: maxRounds,
        action: "Running 360 plan cross-review",
        completedAgents: 0,
        totalAgents: totalPairs,
    };

    logProgress(progress);
    onProgress?.(progress);

    // Create all critique pairs
    const critiquePairs: { reviewer: string; target: string; targetOutput: PlanDebateOutput }[] = [];

    for (const reviewer of agents) {
        for (const target of agents) {
            if (reviewer !== target) {
                const targetOutput = planOutputs.find(o => o.agent === target);
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
                const prompt = buildPlanCritiquePrompt(target, targetOutput.output, diff, platform);
                const result = await runAgent({ agent: reviewer, prompt });

                const stepVotes = parsePlanCritiqueVotes(result.output, targetOutput);

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
                    stepVotes,
                    duration_ms: Date.now() - startTime,
                };
            } catch (error) {
                console.error(`[360 Plan] Critique ${reviewer} -> ${target} failed:`, error);
                completed++;
                return {
                    reviewer,
                    target,
                    critique: `Error: ${error instanceof Error ? error.message : String(error)}`,
                    stepVotes: [],
                    duration_ms: Date.now() - startTime,
                };
            }
        })
    );

    critiques.push(...critiqueResults);
    return critiques;
}

/**
 * Calculate consensus score based on critique votes
 */
function calculatePlanConsensus(
    planOutputs: PlanDebateOutput[],
    critiques: PlanCritiqueResult[]
): number {
    const totalAgents = planOutputs.length;
    if (totalAgents < 2) return 100;

    // Count agreement for each step
    const stepAgreements = new Map<string, { agrees: number; total: number }>();

    for (const planOutput of planOutputs) {
        for (const step of planOutput.plan.steps) {
            const sig = createStepSignature(step);
            if (!stepAgreements.has(sig)) {
                stepAgreements.set(sig, { agrees: 1, total: totalAgents }); // Self-agreement
            }
        }
    }

    // Count votes from critiques
    for (const critique of critiques) {
        for (const vote of critique.stepVotes) {
            // Find matching step
            for (const planOutput of planOutputs) {
                if (planOutput.agent === critique.target) {
                    for (const step of planOutput.plan.steps) {
                        if (step.title.toLowerCase().includes(vote.stepTitle.toLowerCase().slice(0, 20)) ||
                            vote.stepTitle.toLowerCase().includes(step.title.toLowerCase().slice(0, 20))) {
                            const sig = createStepSignature(step);
                            const entry = stepAgreements.get(sig);
                            if (entry && vote.vote === "agree") {
                                entry.agrees++;
                            }
                        }
                    }
                }
            }
        }
    }

    // Calculate average agreement
    let totalAgreement = 0;
    let stepCount = 0;

    for (const [, { agrees, total }] of stepAgreements) {
        totalAgreement += (agrees / total) * 100;
        stepCount++;
    }

    return stepCount > 0 ? Math.round(totalAgreement / stepCount) : 100;
}

/**
 * Build agreement matrix for plans
 */
function buildPlanAgreementMatrix(
    planOutputs: PlanDebateOutput[],
    _critiques: PlanCritiqueResult[]
): Record<string, Record<string, number>> {
    const agents = planOutputs.map(o => o.agent);
    const matrix: Record<string, Record<string, number>> = {};

    for (const agentA of agents) {
        matrix[agentA] = {};
        const planA = planOutputs.find(o => o.agent === agentA)?.plan.steps || [];

        for (const agentB of agents) {
            if (agentA === agentB) {
                matrix[agentA][agentB] = 100;
                continue;
            }

            const planB = planOutputs.find(o => o.agent === agentB)?.plan.steps || [];

            if (planA.length === 0 && planB.length === 0) {
                matrix[agentA][agentB] = 100;
                continue;
            }

            // Count matching steps
            let matchingSteps = 0;
            const totalUniqueSteps = new Set<string>();

            for (const step of planA) {
                totalUniqueSteps.add(createStepSignature(step));
                if (planB.some(s => stepsMatch(step, s))) {
                    matchingSteps++;
                }
            }

            for (const step of planB) {
                totalUniqueSteps.add(createStepSignature(step));
            }

            const agreement = totalUniqueSteps.size > 0
                ? Math.round((matchingSteps * 2 / totalUniqueSteps.size) * 100)
                : 100;

            matrix[agentA][agentB] = Math.min(agreement, 100);
        }
    }

    return matrix;
}

/**
 * Score all plan outputs and calculate round results
 */
function scorePlanRound(
    planOutputs: PlanDebateOutput[],
    diffFiles: string[],
    consensusScore: number
): Record<string, PlanScoreBreakdown> {
    const scores: Record<string, PlanScoreBreakdown> = {};

    for (const output of planOutputs) {
        // Distribute consensus proportionally based on each agent's plan quality
        const baseScore = scorePlanOutput(output.plan, diffFiles, 0);
        const adjustedConsensus = Math.round((baseScore.total / 80) * (consensusScore / 100) * 20);

        const score = {
            ...baseScore,
            consensus: adjustedConsensus,
            total: baseScore.clarity + baseScore.completeness + baseScore.feasibility + adjustedConsensus,
        };

        output.score = score;
        scores[output.agent] = score;
    }

    return scores;
}

/**
 * Determine winner by highest score
 */
function determineWinner(scores: Record<string, PlanScoreBreakdown>): string {
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
 * Run winner agent to compose final plan
 */
async function runPlanComposition(
    winner: string,
    rounds: PlanRound[],
    diff: string
): Promise<ComposedPlanResult> {
    // Collect all plans from all rounds
    const allPlans: { agent: string; plan: string }[] = [];

    for (const round of rounds) {
        for (const plan of round.plans) {
            allPlans.push({ agent: plan.agent, plan: plan.output });
        }
    }

    const prompt = buildPlanComposePrompt(allPlans, diff);
    const result = await runAgent({ agent: winner, prompt });

    return parseComposedPlanResult(result.output, winner);
}

/**
 * Parse composed plan result from agent output
 */
function parseComposedPlanResult(output: string, composer: string): ComposedPlanResult {
    const defaultResult: ComposedPlanResult = {
        composer,
        proposedSteps: [],
        eliminatedSteps: [],
        eliminationReasons: {},
        residualRisks: [],
        openQuestions: [],
        summary: "",
        rawOutput: output,
    };

    try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return defaultResult;

        const parsed = JSON.parse(jsonMatch[0]);

        const proposedSteps: PlanStep[] = (parsed.proposed_steps || []).map(
            (s: Record<string, unknown>) => ({
                phase: typeof s.phase === "number" ? s.phase : 1,
                title: String(s.title || ""),
                description: String(s.description || ""),
                files: Array.isArray(s.files) ? s.files.map(String) : undefined,
                dependencies: Array.isArray(s.dependencies) ? s.dependencies.map(String) : undefined,
                consensus: 0,
            })
        );

        const eliminatedSteps: PlanStep[] = [];
        const eliminationReasons: Record<string, string> = {};

        for (const e of parsed.eliminated_steps || []) {
            const title = String(e.title || "");
            eliminationReasons[title] = String(e.reason || "No reason provided");
            eliminatedSteps.push({
                phase: 0,
                title,
                description: String(e.reason || ""),
                consensus: 0,
            });
        }

        return {
            composer,
            proposedSteps,
            eliminatedSteps,
            eliminationReasons,
            residualRisks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
            openQuestions: Array.isArray(parsed.open_questions) ? parsed.open_questions.map(String) : [],
            summary: String(parsed.summary || ""),
            rawOutput: output,
        };
    } catch {
        return defaultResult;
    }
}

/**
 * Run validation by other agents
 */
async function runPlanValidation(
    composedSteps: PlanStep[],
    validators: string[],
    composer: string,
    diff: string
): Promise<PlanValidationResult> {
    const allVotes: PlanValidationVote[] = [];

    // Run validators in parallel
    const validationPromises = validators.map(async (validator) => {
        const stepsForPrompt = composedSteps.map(s => ({
            phase: s.phase,
            title: s.title,
            description: s.description,
            files: s.files,
        }));

        const prompt = buildPlanValidationPrompt(stepsForPrompt, composer, diff);

        try {
            const result = await runAgent({ agent: validator, prompt });
            return parsePlanValidationVotes(result.output, validator, composedSteps);
        } catch (error) {
            console.error(`[Plan Validator] ${validator} failed:`, error);
            // Default to approval on error
            return composedSteps.map((step) => ({
                stepTitle: step.title,
                step,
                agent: validator,
                vote: "approve" as const,
                reason: "Default approval (validator error)",
            }));
        }
    });

    const voteResults = await Promise.all(validationPromises);
    for (const votes of voteResults) {
        allVotes.push(...votes);
    }

    // Tally votes for each step
    const stepVotes = new Map<number, { approves: number; rejects: number }>();

    for (let i = 0; i < composedSteps.length; i++) {
        stepVotes.set(i, { approves: 0, rejects: 0 });
    }

    for (const vote of allVotes) {
        const index = composedSteps.findIndex(s => s.title === vote.stepTitle);
        if (index >= 0) {
            const tally = stepVotes.get(index);
            if (tally) {
                if (vote.vote === "approve") {
                    tally.approves++;
                } else {
                    tally.rejects++;
                }
            }
        }
    }

    // Categorize steps
    const approvedSteps: PlanStep[] = [];
    const rejectedSteps: PlanStep[] = [];
    const tieSteps: PlanStep[] = [];

    for (let i = 0; i < composedSteps.length; i++) {
        const step = composedSteps[i];
        const tally = stepVotes.get(i);

        if (!tally || tally.approves >= tally.rejects) {
            if (tally && tally.approves === tally.rejects && tally.approves > 0) {
                tieSteps.push(step);
            }
            approvedSteps.push(step);
        } else {
            rejectedSteps.push(step);
        }
    }

    return {
        votes: allVotes,
        approvedSteps,
        rejectedSteps,
        tieSteps,
    };
}

/**
 * Parse validation votes from agent output
 */
function parsePlanValidationVotes(
    output: string,
    agent: string,
    steps: PlanStep[]
): PlanValidationVote[] {
    const votes: PlanValidationVote[] = [];

    try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return votes;

        const parsed = JSON.parse(jsonMatch[0]);

        for (const v of parsed.votes || []) {
            const id = String(v.id || "");
            const indexMatch = id.match(/step_(\d+)/);
            const index = indexMatch ? parseInt(indexMatch[1], 10) : -1;

            if (index >= 0 && index < steps.length) {
                votes.push({
                    stepTitle: steps[index].title,
                    step: steps[index],
                    agent,
                    vote: v.vote === "reject" ? "reject" : "approve",
                    reason: v.reason ? String(v.reason) : undefined,
                });
            }
        }
    } catch {
        // If parsing fails, assume approval for all
        for (const step of steps) {
            votes.push({
                stepTitle: step.title,
                step,
                agent,
                vote: "approve",
                reason: "Default approval (parsing failed)",
            });
        }
    }

    return votes;
}

/**
 * Run the full 360 plan debate pipeline
 */
export async function runPlanDebate360(options: Debate360Options): Promise<Plan360Result> {
    const startTime = Date.now();

    // Configuration
    const agents = options.agents || getDefaultAgents();
    const maxRounds = options.maxRounds || DEFAULT_MAX_ROUNDS;
    const confidenceThreshold = options.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;
    const platform = options.platform || "general";
    const onProgress = options.onProgress;

    // Validate
    validateAgents(agents);
    if (agents.length < 2) {
        throw new Error("At least 2 agents are required for a 360 plan debate");
    }

    // Initialize
    const initProgress: DebateProgress = {
        phase: "initializing",
        round: 0,
        totalRounds: maxRounds,
        action: "Initializing plan debate",
        completedAgents: 0,
        totalAgents: agents.length,
    };
    logProgress(initProgress);
    onProgress?.(initProgress);

    // Step 1: Read git diff (optional for plan mode)
    // Plan mode uses PRD/question as primary context, diff is optional
    let diffResult: DiffResult = { diff: "", file_count: 0, files: [] };
    try {
        const result = await readDiff({ path: options.path });
        if (result.diff && result.file_count > 0) {
            diffResult = result;
            console.error(`[360 Plan] Found ${diffResult.file_count} files as context`);
        } else {
            console.error(`[360 Plan] No git diff found - using PRD/question as context`);
        }
    } catch {
        console.error(`[360 Plan] No git diff available - using PRD/question as context`);
    }

    // Plan mode doesn't require diff - uses the question/PRD as primary input
    const contextForPlan = diffResult.diff || `[No code context - plan based on requirements]\n\nRequirements:\n${options.question}`;

    // Step 2: Run debate rounds until confidence threshold or max rounds
    const rounds: PlanRound[] = [];
    let currentRound = 0;
    let confidence = 0;
    let planOutputs: PlanDebateOutput[] = [];

    // Initial parallel planning
    currentRound = 1;
    planOutputs = await runParallelPlanning(
        agents,
        options.question,
        contextForPlan,
        platform,
        currentRound,
        maxRounds,
        onProgress
    );

    // Validate: require at least 2 agents with valid output
    const workingAgents = planOutputs.filter(isValidPlanOutput);
    if (workingAgents.length < 2) {
        const failedAgents = planOutputs.filter(o => !isValidPlanOutput(o)).map(o => o.agent);
        throw new Error(
            `360 plan debate requires at least 2 working agents. ` +
            `Only ${workingAgents.length} agent(s) produced valid output. ` +
            `Failed agents: ${failedAgents.join(", ")}. ` +
            `Check agent timeouts and ensure agents are properly configured.`
        );
    }
    console.error(`[360 Plan] ${workingAgents.length}/${agents.length} agents produced valid output`);

    // 360 debate loop
    while (confidence < confidenceThreshold && currentRound <= maxRounds) {
        // Run 360 cross-review
        const critiques = await run360PlanCritique(
            planOutputs,
            contextForPlan,
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
            action: "Scoring plans",
            completedAgents: agents.length,
            totalAgents: agents.length,
        };
        logProgress(scoringProgress);
        onProgress?.(scoringProgress);

        // Calculate consensus
        const consensusScore = calculatePlanConsensus(planOutputs, critiques);

        const scores = scorePlanRound(planOutputs, diffResult.files, consensusScore);

        // Confidence = consensus for plan mode
        confidence = consensusScore;

        const confidenceProgress: DebateProgress = {
            ...scoringProgress,
            confidence,
            action: `Confidence: ${confidence}%`,
        };
        logProgress(confidenceProgress);
        onProgress?.(confidenceProgress);

        // Build agreement matrix
        const agreementMatrix = buildPlanAgreementMatrix(planOutputs, critiques);

        // Store round data
        rounds.push({
            round: currentRound,
            plans: [...planOutputs],
            critiques,
            scores,
            confidence,
            agreementMatrix,
        });

        // Check if we need another round
        if (confidence < confidenceThreshold && currentRound < maxRounds) {
            console.error(`[360 Plan] Confidence ${confidence}% < ${confidenceThreshold}% - Starting round ${currentRound + 1}`);
            currentRound++;

            // Re-run parallel planning for fresh perspectives in new round
            planOutputs = await runParallelPlanning(
                agents,
                options.question,
                contextForPlan,
                platform,
                currentRound,
                maxRounds,
                onProgress
            );

            // Re-validate working agents
            const newWorkingAgents = planOutputs.filter(isValidPlanOutput);
            if (newWorkingAgents.length < 2) {
                console.error(`[360 Plan] Warning: Only ${newWorkingAgents.length} agents working in round ${currentRound}`);
            }
        } else {
            break;
        }
    }

    console.error(`[360 Plan] Debate complete after ${currentRound} round(s) with ${confidence}% confidence`);

    // Step 3: Determine winner
    const lastRound = rounds[rounds.length - 1];
    const winner = determineWinner(lastRound.scores);
    console.error(`[360 Plan] Winner: ${winner.toUpperCase()}`);

    // Step 4: Winner composes final plan
    const composingProgress: DebateProgress = {
        phase: "composing",
        round: currentRound,
        totalRounds: maxRounds,
        agent: winner,
        action: `${winner} composing final plan`,
        completedAgents: 0,
        totalAgents: 1,
    };
    logProgress(composingProgress);
    onProgress?.(composingProgress);

    const composed = await runPlanComposition(winner, rounds, contextForPlan);

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

    const validation = await runPlanValidation(
        composed.proposedSteps,
        validators,
        winner,
        contextForPlan
    );

    // Step 6: Compile final result
    const finalPlan = validation.approvedSteps;
    const finalResidualRisks = composed.residualRisks;
    const finalOpenQuestions = composed.openQuestions;
    const finalSummary = composed.summary;

    // Step 7: Write report (handled by reporter)
    const reportProgress: DebateProgress = {
        phase: "writing_report",
        round: currentRound,
        totalRounds: maxRounds,
        action: "Writing plan report",
        completedAgents: agents.length,
        totalAgents: agents.length,
    };
    logProgress(reportProgress);
    onProgress?.(reportProgress);

    const result: Plan360Result = {
        mode: "plan",
        winner,
        rounds,
        composed,
        validation,
        finalPlan,
        finalResidualRisks,
        finalOpenQuestions,
        finalSummary,
        confidence,
        reportPath: "", // Will be set by reporter
        totalDuration_ms: Date.now() - startTime,
    };

    console.error(`[360 Plan] Complete!`);
    console.error(`[360 Plan] Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    return result;
}
