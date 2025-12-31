/**
 * @debate-agent/core
 * 
 * Core logic for multi-agent debate with P0/P1/P2 code review and debate planning.
 * This package is framework-agnostic and can be used standalone or bundled.
 */

// Types
export * from "./types.js";

// Configuration
export {
    loadConfig,
    getAgentConfig,
    getAgentNames,
    getAllAgents,
    getDebateConfig,
    getReviewConfig,
    getGitConfig,
    getDefaultAgents,
    validateAgents,
    clearConfigCache,
    // Health check utilities
    checkAgentHealth,
    checkAllAgentsHealth,
    getHealthyAgents,
    validateAndFilterAgents,
} from "./config.js";

// Engine
export {
    runDebate,
    debateReview,
} from "./engine/debate.js";

export {
    scoreReviewOutput,
    parseReviewOutput,
    generateScoringReason,
    scoreOutput,
} from "./engine/judge.js";

export {
    generateMergedRecommendation,
} from "./engine/merger.js";

export {
    createDebatePlan,
    getAgentPhaseInstructions,
    formatDebatePlan,
} from "./engine/planner.js";

// 360 Debate (v2.0) - Review Mode
export {
    runDebate360,
    debate360,
} from "./engine/debate360.js";

export {
    calculateConfidence,
    buildAgreementMatrix,
    getAgreedFindings,
    getDisputedFindings,
    createFindingSignature,
    findingsMatch,
} from "./engine/confidence.js";

export {
    runWinnerComposition,
    runValidation,
} from "./engine/validator.js";

export {
    writeDebateReport,
    writePlanReport,
    getReportPath,
} from "./engine/reporter.js";

// 360 Debate (v2.1) - Plan Mode
export {
    runPlanDebate360,
} from "./engine/plan-debate360.js";

export {
    scorePlanOutput,
    parsePlanOutput,
    generatePlanScoringReason,
    createStepSignature,
    stepsMatch,
} from "./engine/plan-judge.js";

// Prompts - Review Mode
export {
    buildReviewPrompt,
    buildCritiquePrompt,
    buildDebatePlanPrompt,
    REVIEW_SYSTEM_PROMPT,
} from "./prompts/review-template.js";

// Prompts - Plan Mode
export {
    buildPlanPrompt,
    buildPlanCritiquePrompt,
    buildPlanComposePrompt,
    buildPlanValidationPrompt,
    PLAN_SYSTEM_PROMPT,
} from "./prompts/plan-template.js";

export {
    getPlatformRules,
    getAllPlatformRules,
} from "./prompts/platform-rules.js";

// Tools (for programmatic use)
export { readDiff } from "./tools/read-diff.js";
export { runAgent, runAgentForReview, runAgentForCritique } from "./tools/run-agent.js";
