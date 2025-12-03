/**
 * Type definitions for the debate-agent core
 */

// Severity levels for code review findings
export type Severity = "P0" | "P1" | "P2";

// Platform types for specialized review
export type Platform = "flutter" | "android" | "ios" | "backend" | "general";

// Debate modes
export type DebateMode = "consensus" | "adversarial" | "collaborative";

// Agent configuration
export interface AgentConfig {
    name: string;
    path: string;
    args: string[];
    timeout_seconds: number;
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
