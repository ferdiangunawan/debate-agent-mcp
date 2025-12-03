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

// Prompts
export {
    buildReviewPrompt,
    buildCritiquePrompt,
    buildDebatePlanPrompt,
    REVIEW_SYSTEM_PROMPT,
} from "./prompts/review-template.js";

export {
    getPlatformRules,
    getAllPlatformRules,
} from "./prompts/platform-rules.js";

// Tools (for programmatic use)
export { readDiff } from "./tools/read-diff.js";
export { runAgent, runAgentForReview, runAgentForCritique } from "./tools/run-agent.js";
