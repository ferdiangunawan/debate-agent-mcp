/**
 * Plan judge scoring system for implementation planning mode
 *
 * Unlike review mode (P0/P1/P2), plan mode scores on:
 * - Clarity: 0-30 (clear descriptions, specific file paths)
 * - Completeness: 0-30 (all aspects covered)
 * - Feasibility: 0-20 (realistic steps, proper ordering)
 * - Consensus: 0-20 (agreement from 360 review)
 *
 * Total: 0-100
 */

import type { PlanScoreBreakdown, PlanOutput, PlanStep } from "../types.js";

const PLAN_SCORING_WEIGHTS = {
    CLARITY_MAX: 30,
    COMPLETENESS_MAX: 30,
    FEASIBILITY_MAX: 20,
    CONSENSUS_MAX: 20,
};

/**
 * Score an agent's plan output
 */
export function scorePlanOutput(
    plan: PlanOutput,
    diffFiles: string[],
    consensusScore: number = 0
): PlanScoreBreakdown {
    const clarityScore = calculateClarityScore(plan);
    const completenessScore = calculateCompletenessScore(plan, diffFiles);
    const feasibilityScore = calculateFeasibilityScore(plan);
    const cappedConsensus = Math.min(consensusScore, PLAN_SCORING_WEIGHTS.CONSENSUS_MAX);

    return {
        clarity: clarityScore,
        completeness: completenessScore,
        feasibility: feasibilityScore,
        consensus: cappedConsensus,
        total: clarityScore + completenessScore + feasibilityScore + cappedConsensus,
    };
}

/**
 * Calculate clarity score (0-30)
 * - Clear titles and descriptions
 * - Specific file paths
 * - Proper formatting
 */
function calculateClarityScore(plan: PlanOutput): number {
    let score = 0;

    // Has steps (base requirement)
    if (plan.steps.length > 0) {
        score += 5;
    }

    // Each step has a clear title
    const stepsWithTitles = plan.steps.filter(s => s.title && s.title.length >= 5);
    score += Math.min(stepsWithTitles.length * 2, 8);

    // Each step has a meaningful description
    const stepsWithDescriptions = plan.steps.filter(s => s.description && s.description.length >= 20);
    score += Math.min(stepsWithDescriptions.length * 2, 8);

    // Steps have specific file paths
    const stepsWithFiles = plan.steps.filter(s => s.files && s.files.length > 0);
    score += Math.min(stepsWithFiles.length * 1.5, 6);

    // Has a summary
    if (plan.summary && plan.summary.length >= 20) {
        score += 3;
    }

    return Math.min(Math.round(score), PLAN_SCORING_WEIGHTS.CLARITY_MAX);
}

/**
 * Calculate completeness score (0-30)
 * - Covers all relevant files
 * - Has risks identified
 * - Has open questions (shows thoroughness)
 */
function calculateCompletenessScore(plan: PlanOutput, diffFiles: string[]): number {
    let score = 0;

    // Check file coverage
    if (plan.steps.length > 0 && diffFiles.length > 0) {
        const mentionedFiles = new Set<string>();
        for (const step of plan.steps) {
            if (step.files) {
                for (const file of step.files) {
                    const basename = file.split("/").pop() || file;
                    mentionedFiles.add(basename.toLowerCase());
                }
            }
        }

        // Check how many diff files are covered
        let coveredCount = 0;
        for (const diffFile of diffFiles) {
            const diffBasename = (diffFile.split("/").pop() || diffFile).toLowerCase();
            if (mentionedFiles.has(diffBasename)) {
                coveredCount++;
            }
        }

        const coverageRatio = diffFiles.length > 0 ? coveredCount / diffFiles.length : 0;
        score += Math.round(coverageRatio * 15);
    } else if (plan.steps.length > 0) {
        // Has steps but no diff files to compare
        score += 10;
    }

    // Has multiple phases (shows structured thinking)
    const phases = new Set(plan.steps.map(s => s.phase));
    if (phases.size >= 3) {
        score += 5;
    } else if (phases.size >= 2) {
        score += 3;
    }

    // Has risks identified
    if (plan.risks && plan.risks.length > 0) {
        score += Math.min(plan.risks.length * 2, 5);
    }

    // Has open questions (shows thoroughness)
    if (plan.open_questions && plan.open_questions.length > 0) {
        score += Math.min(plan.open_questions.length * 2, 5);
    }

    return Math.min(Math.round(score), PLAN_SCORING_WEIGHTS.COMPLETENESS_MAX);
}

/**
 * Calculate feasibility score (0-20)
 * - Proper step ordering by phase
 * - Dependencies are valid
 * - Realistic number of steps
 */
function calculateFeasibilityScore(plan: PlanOutput): number {
    let score = 0;

    // Has steps
    if (plan.steps.length > 0) {
        score += 5;
    }

    // Steps are ordered by phase (ascending)
    if (plan.steps.length >= 2) {
        let isOrdered = true;
        for (let i = 1; i < plan.steps.length; i++) {
            if (plan.steps[i].phase < plan.steps[i - 1].phase) {
                isOrdered = false;
                break;
            }
        }
        if (isOrdered) {
            score += 5;
        }
    } else if (plan.steps.length === 1) {
        score += 5;
    }

    // Dependencies are valid (referenced steps exist)
    if (plan.steps.length > 0) {
        const stepTitles = new Set(plan.steps.map(s => s.title.toLowerCase()));
        let validDeps = true;

        for (const step of plan.steps) {
            if (step.dependencies && step.dependencies.length > 0) {
                for (const dep of step.dependencies) {
                    if (!stepTitles.has(dep.toLowerCase())) {
                        validDeps = false;
                        break;
                    }
                }
            }
            if (!validDeps) break;
        }

        if (validDeps) {
            score += 5;
        }
    }

    // Reasonable number of steps (not too few, not too many)
    const stepCount = plan.steps.length;
    if (stepCount >= 3 && stepCount <= 15) {
        score += 5;
    } else if (stepCount >= 2 && stepCount <= 20) {
        score += 3;
    } else if (stepCount >= 1) {
        score += 1;
    }

    return Math.min(Math.round(score), PLAN_SCORING_WEIGHTS.FEASIBILITY_MAX);
}

/**
 * Parse raw agent output into PlanOutput structure
 */
export function parsePlanOutput(rawOutput: string): PlanOutput {
    const defaultOutput: PlanOutput = {
        steps: [],
        summary: "",
        risks: [],
        open_questions: [],
        raw_output: rawOutput,
    };

    try {
        // Try to extract JSON from the output
        const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return defaultOutput;
        }

        const parsed = JSON.parse(jsonMatch[0]);

        return {
            steps: Array.isArray(parsed.steps)
                ? parsed.steps.map(normalizePlanStep)
                : [],
            summary: typeof parsed.summary === "string" ? parsed.summary : "",
            risks: Array.isArray(parsed.risks)
                ? parsed.risks.map(String)
                : [],
            open_questions: Array.isArray(parsed.open_questions)
                ? parsed.open_questions.map(String)
                : [],
            raw_output: rawOutput,
        };
    } catch {
        return defaultOutput;
    }
}

/**
 * Normalize a plan step object
 */
function normalizePlanStep(raw: Record<string, unknown>): PlanStep {
    return {
        phase: typeof raw.phase === "number" ? raw.phase : 1,
        title: String(raw.title || "Untitled Step"),
        description: String(raw.description || ""),
        files: Array.isArray(raw.files)
            ? raw.files.map(String)
            : undefined,
        dependencies: Array.isArray(raw.dependencies)
            ? raw.dependencies.map(String)
            : undefined,
        consensus: typeof raw.consensus === "number" ? raw.consensus : 0,
    };
}

/**
 * Generate a human-readable explanation of the plan scoring
 */
export function generatePlanScoringReason(
    evaluations: { agent: string; score: PlanScoreBreakdown }[]
): string {
    const reasons: string[] = [];

    // Sort by total score
    const sorted = [...evaluations].sort((a, b) => b.score.total - a.score.total);
    const winner = sorted[0];

    // Compare scores
    for (const { agent, score } of sorted) {
        const parts: string[] = [];
        if (score.clarity > 0) parts.push(`clarity: ${score.clarity}`);
        if (score.completeness > 0) parts.push(`completeness: ${score.completeness}`);
        if (score.feasibility > 0) parts.push(`feasibility: ${score.feasibility}`);
        if (score.consensus > 0) parts.push(`consensus: ${score.consensus}`);

        reasons.push(`${agent}: ${score.total}/100 (${parts.join(", ") || "no steps"})`);
    }

    // Winner declaration
    if (sorted.length > 1) {
        const margin = winner.score.total - sorted[1].score.total;
        if (margin === 0) {
            reasons.push("Result: Tie between agents");
        } else {
            reasons.push(`Winner: ${winner.agent} by ${margin} points`);
        }
    }

    return reasons.join(". ");
}

/**
 * Calculate step signature for matching
 */
export function createStepSignature(step: PlanStep): string {
    const normalized = [
        step.phase,
        step.title.toLowerCase().replace(/[^\w\s]/g, "").trim(),
    ].join("|");
    return normalized;
}

/**
 * Check if two steps are similar
 */
export function stepsMatch(a: PlanStep, b: PlanStep): boolean {
    // Same phase
    if (a.phase !== b.phase) return false;

    const titleA = a.title.toLowerCase().replace(/[^\w\s]/g, "").trim();
    const titleB = b.title.toLowerCase().replace(/[^\w\s]/g, "").trim();

    // Exact match
    if (titleA === titleB) return true;

    // Check for significant word overlap
    const wordsA = new Set(titleA.split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(titleB.split(/\s+/).filter(w => w.length > 3));

    if (wordsA.size === 0 || wordsB.size === 0) return false;

    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);

    // Jaccard similarity > 0.5
    const similarity = intersection.length / union.size;
    return similarity > 0.5;
}
