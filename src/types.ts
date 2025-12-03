/**
 * Type definitions for the debate-reviewer-mcp server
 */

// Agent types
export type AgentType = "codex" | "claude";

// Configuration types
export interface AgentConfig {
  path: string;
  args: string[];
  timeout_seconds: number;
}

export interface DebateConfig {
  include_critique_round: boolean;
  max_output_length: number;
}

export interface GitConfig {
  include_staged: boolean;
  max_diff_lines: number;
}

export interface Config {
  agents: {
    codex: AgentConfig;
    claude: AgentConfig;
  };
  debate: DebateConfig;
  git: GitConfig;
}

// Tool input types
export interface ReadDiffInput {
  staged?: boolean;
  path?: string;
}

export interface RunAgentInput {
  agent: AgentType;
  prompt: string;
  context?: string;
}

export interface DebateReviewInput {
  question: string;
  includeCritique?: boolean;
  path?: string;
}

// Tool output types
export interface DiffResult {
  diff: string;
  file_count: number;
  files: string[];
}

export interface AgentResult {
  output: string;
  exit_code: number;
  duration_ms: number;
}

export interface ScoreBreakdown {
  clarity: number;
  concrete: number;
  hallucination: number;
  reproducible: number;
  total: number;
}

export interface Evaluation {
  score_codex: number;
  score_claude: number;
  breakdown_codex: ScoreBreakdown;
  breakdown_claude: ScoreBreakdown;
  reason: string;
}

export interface DebateResult {
  winner: AgentType;
  codex_output: string;
  claude_output: string;
  codex_critique?: string;
  claude_critique?: string;
  evaluation: Evaluation;
  final_recommendation: string;
}

// Internal types for debate engine
export interface AgentOutput {
  agent: AgentType;
  output: string;
  critique?: string;
  score: ScoreBreakdown;
}
