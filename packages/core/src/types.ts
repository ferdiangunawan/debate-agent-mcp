/**
 * Type definitions for the debate-agent core
 */

// Severity levels for code review findings
export type Severity = "P0" | "P1" | "P2";

// Platform types for specialized review
export type Platform = "flutter" | "android" | "ios" | "backend" | "general";

// Debate modes
export type DebateMode = "consensus" | "adversarial" | "collaborative";

// Retry configuration for agent execution
export interface RetryConfig {
    /** Maximum number of retry attempts (0 = no retries) */
    maxRetries: number;
    /** Base delay in milliseconds for exponential backoff */
    baseDelayMs: number;
    /** Maximum delay in milliseconds */
    maxDelayMs: number;
}

// Agent configuration
export interface AgentConfig {
    name: string;
    path: string;
    args: string[];
    timeout_seconds: number;
    /** Optional retry configuration override */
    retry?: RetryConfig;
}

// Agent health check result
export interface AgentHealthResult {
    agent: string;
    healthy: boolean;
    error?: string;
    latency_ms?: number;
}

// Debate configuration
export interface DebateConfig {
    default_agents: string[];
    include_critique_round: boolean;
    max_output_length: number;
    default_mode: DebateMode;
}

// Review configuration
export interface ReviewConfig {
    severity_enabled: boolean;
    platforms: Platform[];
}

// Git configuration
export interface GitConfig {
    include_staged: boolean;
    max_diff_lines: number;
}

// Full configuration
export interface Config {
    agents: Record<string, AgentConfig>;
    debate: DebateConfig;
    review: ReviewConfig;
    git: GitConfig;
}

// Code review finding with severity
export interface Finding {
    severity: Severity;
    title: string;
    file?: string;
    line?: number;
    detail: string;
    fix: string;
}

// Parsed review output from an agent
export interface ReviewOutput {
    findings: Finding[];
    residual_risks: string[];
    open_questions: string[];
    raw_output: string;
}

// Tool input types
export interface ReadDiffInput {
    staged?: boolean;
    path?: string;
}

export interface RunAgentInput {
    agent: string;
    prompt: string;
    context?: string;
}

export interface DebateReviewInput {
    question: string;
    agents?: string[];
    includeCritique?: boolean;
    path?: string;
    platform?: Platform;
}

export interface DebatePlanInput {
    topic: string;
    agents: string[];
    mode?: DebateMode;
    rounds?: number;
}

// Tool output types
export interface DiffResult {
    diff: string;
    file_count: number;
    files: string[];
}

export interface AgentResult {
    agent: string;
    output: string;
    exit_code: number;
    duration_ms: number;
}

// Score breakdown for an agent
export interface ScoreBreakdown {
    p0_findings: number;
    p1_findings: number;
    p2_findings: number;
    false_positives: number;
    concrete_fixes: number;
    file_accuracy: number;
    clarity: number;
    total: number;
}

// Agent evaluation result
export interface AgentEvaluation {
    agent: string;
    score: ScoreBreakdown;
    review: ReviewOutput;
}

// Debate evaluation summary
export interface Evaluation {
    agents: AgentEvaluation[];
    winner: string;
    reason: string;
}

// Debate result
export interface DebateResult {
    winner: string;
    agent_outputs: Record<string, string>;
    agent_critiques?: Record<string, string>;
    evaluation: Evaluation;
    merged_findings: Finding[];
    residual_risks: string[];
    open_questions: string[];
    final_recommendation: string;
}

// Debate plan phase
export interface DebatePhase {
    phase: number;
    name: string;
    description: string;
    agent_actions: Record<string, string>;
}

// Scoring criteria for debate plan
export interface ScoringCriteria {
    p0_weight: number;
    p1_weight: number;
    p2_weight: number;
    false_positive_penalty: number;
    concrete_fix_weight: number;
    file_accuracy_weight: number;
    clarity_max: number;
}

// Debate plan result
export interface DebatePlan {
    plan_id: string;
    topic: string;
    mode: DebateMode;
    rounds: number;
    agents: string[];
    phases: DebatePhase[];
    scoring_criteria: ScoringCriteria;
}

// Agent output during debate
export interface AgentDebateOutput {
    agent: string;
    output: string;
    review: ReviewOutput;
    critique?: string;
    score: ScoreBreakdown;
}

// Debate options for running a debate
export interface DebateOptions {
    question: string;
    agents?: string[];
    includeCritique?: boolean;
    path?: string;
    platform?: Platform;
}

// ============================================
// 360 DEBATE TYPES (v2.0)
// ============================================

/**
 * Options for running a 360-degree multi-round debate
 */
export interface Debate360Options extends DebateOptions {
    /** Debate mode: 'review' for P0/P1/P2 code review, 'plan' for implementation planning */
    mode?: DebateMode360;
    /** Maximum number of 360 rounds (default: 3) */
    maxRounds?: number;
    /** Confidence threshold to stop debating (default: 80) */
    confidenceThreshold?: number;
    /** Optional progress callback for real-time updates */
    onProgress?: (progress: DebateProgress) => void;
}

/**
 * Progress update during debate execution
 */
export interface DebateProgress {
    /** Current phase of the debate */
    phase: "initializing" | "parallel_review" | "360_critique" | "scoring" | "composing" | "validating" | "writing_report";
    /** Current round number */
    round: number;
    /** Total rounds (max) */
    totalRounds: number;
    /** Current agent being processed (if applicable) */
    agent?: string;
    /** Target agent being reviewed (if applicable) */
    targetAgent?: string;
    /** Human-readable action description */
    action: string;
    /** Number of completed agents in current step */
    completedAgents: number;
    /** Total agents in current step */
    totalAgents: number;
    /** Current confidence score (if calculated) */
    confidence?: number;
}

/**
 * Result of a single critique in 360 review
 */
export interface CritiqueResult {
    /** Agent that performed the critique */
    reviewer: string;
    /** Agent whose output was critiqued */
    target: string;
    /** Raw critique output */
    critique: string;
    /** Votes on each finding from the target */
    votes: FindingVote[];
    /** Duration in ms */
    duration_ms: number;
}

/**
 * Vote on a specific finding during critique
 */
export interface FindingVote {
    /** ID/signature of the finding */
    findingId: string;
    /** Finding title for reference */
    findingTitle: string;
    /** Vote decision */
    vote: "agree" | "disagree" | "abstain";
    /** Reason for the vote */
    reason?: string;
}

/**
 * Data for a single round of 360 debate
 */
export interface DebateRound {
    /** Round number (1-based) */
    round: number;
    /** All agent reviews from this round */
    reviews: AgentDebateOutput[];
    /** All critiques from 360 review */
    critiques: CritiqueResult[];
    /** Scores for each agent after this round */
    scores: Record<string, ScoreBreakdown>;
    /** Confidence score after this round */
    confidence: number;
    /** Agreement matrix (agent -> agent -> agreement %) */
    agreementMatrix: Record<string, Record<string, number>>;
}

/**
 * Result of confidence calculation
 */
export interface ConfidenceResult {
    /** Overall confidence score (0-100) */
    score: number;
    /** Whether the debate has converged (confidence >= threshold) */
    converged: boolean;
    /** Agreement matrix between agents */
    agreementMatrix: Record<string, Record<string, number>>;
    /** Number of findings with majority agreement */
    agreedFindings: number;
    /** Total number of unique findings */
    totalFindings: number;
}

/**
 * Vote during final validation phase
 */
export interface ValidationVote {
    /** ID/signature of the finding */
    findingId: string;
    /** Finding being validated */
    finding: Finding;
    /** Agent casting the vote */
    agent: string;
    /** Vote decision */
    vote: "approve" | "reject";
    /** Reason for the vote */
    reason?: string;
}

/**
 * Result of validation phase
 */
export interface ValidationResult {
    /** All validation votes cast */
    votes: ValidationVote[];
    /** Findings that were approved by majority */
    approvedFindings: Finding[];
    /** Findings that were rejected */
    rejectedFindings: Finding[];
    /** Findings with tie votes (winner breaks tie) */
    tieFindings: Finding[];
}

/**
 * Composed result from winner agent
 */
export interface ComposedResult {
    /** The winner agent who composed */
    composer: string;
    /** Proposed merged findings */
    proposedFindings: Finding[];
    /** Findings that were eliminated */
    eliminatedFindings: Finding[];
    /** Justification for eliminations */
    eliminationReasons: Record<string, string>;
    /** Residual risks identified */
    residualRisks: string[];
    /** Open questions */
    openQuestions: string[];
    /** Raw composition output */
    rawOutput: string;
}

/**
 * Full result of 360 debate
 */
export interface Debate360Result {
    /** Winning agent (highest score) */
    winner: string;
    /** All rounds of the debate */
    rounds: DebateRound[];
    /** Composed result from winner */
    composed: ComposedResult;
    /** Validation result from other agents */
    validation: ValidationResult;
    /** Final approved findings */
    finalFindings: Finding[];
    /** Final residual risks */
    finalResidualRisks: string[];
    /** Final open questions */
    finalOpenQuestions: string[];
    /** Final confidence score */
    confidence: number;
    /** Path to the generated MD report */
    reportPath: string;
    /** Total duration in ms */
    totalDuration_ms: number;
}

// ============================================
// PLAN MODE TYPES (v2.1)
// ============================================

/**
 * Mode for 360 debate: review (P0/P1/P2) or plan (consensus-based)
 */
export type DebateMode360 = "review" | "plan";

/**
 * A single step in an implementation plan
 */
export interface PlanStep {
    /** Phase number (1-based) */
    phase: number;
    /** Step title */
    title: string;
    /** Step description */
    description: string;
    /** Files to be modified/created */
    files?: string[];
    /** Dependencies (other step titles that must be done first) */
    dependencies?: string[];
    /** Consensus score from 360 review (0-100) */
    consensus: number;
}

/**
 * Parsed plan output from an agent
 */
export interface PlanOutput {
    /** Implementation steps */
    steps: PlanStep[];
    /** Overall approach summary */
    summary: string;
    /** Potential risks */
    risks: string[];
    /** Questions needing clarification */
    open_questions: string[];
    /** Raw output string */
    raw_output: string;
}

/**
 * Agent output during plan debate
 */
export interface PlanDebateOutput {
    /** Agent name */
    agent: string;
    /** Raw output string */
    output: string;
    /** Parsed plan */
    plan: PlanOutput;
    /** Score breakdown */
    score: PlanScoreBreakdown;
}

/**
 * Score breakdown for plan mode (0-100 total)
 */
export interface PlanScoreBreakdown {
    /** Clarity of descriptions and file paths (0-30) */
    clarity: number;
    /** Completeness - all aspects covered (0-30) */
    completeness: number;
    /** Feasibility - realistic steps, proper ordering (0-20) */
    feasibility: number;
    /** Consensus - agreement from 360 review (0-20) */
    consensus: number;
    /** Total score (0-100) */
    total: number;
}

/**
 * Critique result for plan mode
 */
export interface PlanCritiqueResult {
    /** Agent that performed the critique */
    reviewer: string;
    /** Agent whose plan was critiqued */
    target: string;
    /** Raw critique output */
    critique: string;
    /** Votes on each step */
    stepVotes: PlanStepVote[];
    /** Duration in ms */
    duration_ms: number;
}

/**
 * Vote on a specific plan step
 */
export interface PlanStepVote {
    /** Step title */
    stepTitle: string;
    /** Phase number */
    phase: number;
    /** Vote decision */
    vote: "agree" | "disagree" | "modify";
    /** Reason for the vote */
    reason?: string;
    /** Suggested modification (if vote is "modify") */
    suggestion?: string;
}

/**
 * Data for a single round of plan debate
 */
export interface PlanRound {
    /** Round number (1-based) */
    round: number;
    /** All agent plans from this round */
    plans: PlanDebateOutput[];
    /** All critiques from 360 review */
    critiques: PlanCritiqueResult[];
    /** Scores for each agent after this round */
    scores: Record<string, PlanScoreBreakdown>;
    /** Confidence score after this round */
    confidence: number;
    /** Agreement matrix (agent -> agent -> agreement %) */
    agreementMatrix: Record<string, Record<string, number>>;
}

/**
 * Composed plan result from winner agent
 */
export interface ComposedPlanResult {
    /** The winner agent who composed */
    composer: string;
    /** Final merged plan steps */
    proposedSteps: PlanStep[];
    /** Steps that were eliminated */
    eliminatedSteps: PlanStep[];
    /** Justification for eliminations */
    eliminationReasons: Record<string, string>;
    /** Residual risks identified */
    residualRisks: string[];
    /** Open questions */
    openQuestions: string[];
    /** Overall summary */
    summary: string;
    /** Raw composition output */
    rawOutput: string;
}

/**
 * Validation vote for plan step
 */
export interface PlanValidationVote {
    /** Step title */
    stepTitle: string;
    /** The step being validated */
    step: PlanStep;
    /** Agent casting the vote */
    agent: string;
    /** Vote decision */
    vote: "approve" | "reject";
    /** Reason for the vote */
    reason?: string;
}

/**
 * Result of plan validation phase
 */
export interface PlanValidationResult {
    /** All validation votes cast */
    votes: PlanValidationVote[];
    /** Steps that were approved by majority */
    approvedSteps: PlanStep[];
    /** Steps that were rejected */
    rejectedSteps: PlanStep[];
    /** Steps with tie votes */
    tieSteps: PlanStep[];
}

/**
 * Full result of plan 360 debate
 */
export interface Plan360Result {
    /** Mode indicator */
    mode: "plan";
    /** Winning agent (highest score) */
    winner: string;
    /** All rounds of the debate */
    rounds: PlanRound[];
    /** Composed plan from winner */
    composed: ComposedPlanResult;
    /** Validation result from other agents */
    validation: PlanValidationResult;
    /** Final approved plan steps */
    finalPlan: PlanStep[];
    /** Final residual risks */
    finalResidualRisks: string[];
    /** Final open questions */
    finalOpenQuestions: string[];
    /** Overall summary */
    finalSummary: string;
    /** Final confidence score */
    confidence: number;
    /** Path to the generated MD report */
    reportPath: string;
    /** Total duration in ms */
    totalDuration_ms: number;
}
