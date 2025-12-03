/**
 * Debate orchestration engine
 * Coordinates the full debate pipeline between agents
 */

import type {
  AgentType,
  DebateResult,
  DiffResult,
} from "../types.js";
import { readDiff } from "../tools/read-diff.js";
import { runAgentForReview, runAgentForCritique } from "../tools/run-agent.js";
import { scoreOutput, generateScoringReason } from "./judge.js";
import { generateMergedRecommendation } from "./merger.js";
import { getDebateConfig } from "../config.js";

export interface DebateOptions {
  question: string;
  includeCritique?: boolean;
  path?: string;
}

/**
 * Run the full debate pipeline
 *
 * Steps:
 * A. Gather uncommitted diff
 * B. Run Codex CLI with diff
 * C. Run Claude CLI with diff
 * D. Optional critique round
 * E. Score both outputs with deterministic judge
 * F. Pick winner
 * G. Generate merged recommendation
 */
export async function runDebate(options: DebateOptions): Promise<DebateResult> {
  const config = getDebateConfig();
  const includeCritique = options.includeCritique ?? config.include_critique_round;

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

  // Step B & C: Run both agents in parallel
  console.error("[Debate] Step B & C: Running agents in parallel...");

  const [codexResult, claudeResult] = await Promise.all([
    runAgentForReview("codex", options.question, diffResult.diff).catch(
      (error) => ({
        output: `Error running Codex: ${error.message}`,
        exit_code: 1,
        duration_ms: 0,
      })
    ),
    runAgentForReview("claude", options.question, diffResult.diff).catch(
      (error) => ({
        output: `Error running Claude: ${error.message}`,
        exit_code: 1,
        duration_ms: 0,
      })
    ),
  ]);

  console.error(`[Debate] Codex completed in ${codexResult.duration_ms}ms`);
  console.error(`[Debate] Claude completed in ${claudeResult.duration_ms}ms`);

  let codexOutput = codexResult.output;
  let claudeOutput = claudeResult.output;
  let codexCritique: string | undefined;
  let claudeCritique: string | undefined;

  // Step D: Optional critique round
  if (includeCritique) {
    console.error("[Debate] Step D: Running critique round...");

    const [codexCritiqueResult, claudeCritiqueResult] = await Promise.all([
      runAgentForCritique("codex", claudeOutput, diffResult.diff).catch(
        (error) => ({
          output: `Error: ${error.message}`,
          exit_code: 1,
          duration_ms: 0,
        })
      ),
      runAgentForCritique("claude", codexOutput, diffResult.diff).catch(
        (error) => ({
          output: `Error: ${error.message}`,
          exit_code: 1,
          duration_ms: 0,
        })
      ),
    ]);

    codexCritique = codexCritiqueResult.output;
    claudeCritique = claudeCritiqueResult.output;

    console.error("[Debate] Critique round completed");

    // Append critiques to main outputs for scoring
    codexOutput += `\n\n## Critique of Claude's Review\n${codexCritique}`;
    claudeOutput += `\n\n## Critique of Codex's Review\n${claudeCritique}`;
  }

  // Step E: Score both outputs
  console.error("[Debate] Step E: Scoring outputs...");

  const codexScore = scoreOutput(codexOutput, diffResult.files);
  const claudeScore = scoreOutput(claudeOutput, diffResult.files);

  console.error(`[Debate] Codex score: ${codexScore.total}`);
  console.error(`[Debate] Claude score: ${claudeScore.total}`);

  // Step F: Pick winner
  const winner: AgentType =
    codexScore.total > claudeScore.total ? "codex" : "claude";

  console.error(`[Debate] Step F: Winner is ${winner}`);

  // Step G: Generate merged recommendation
  console.error("[Debate] Step G: Generating merged recommendation...");

  const finalRecommendation = generateMergedRecommendation({
    codexOutput: codexResult.output,
    claudeOutput: claudeResult.output,
    codexScore,
    claudeScore,
    winner,
    diffFiles: diffResult.files,
  });

  const reason = generateScoringReason(codexScore, claudeScore);

  return {
    winner,
    codex_output: codexResult.output,
    claude_output: claudeResult.output,
    codex_critique: codexCritique,
    claude_critique: claudeCritique,
    evaluation: {
      score_codex: codexScore.total,
      score_claude: claudeScore.total,
      breakdown_codex: codexScore,
      breakdown_claude: claudeScore,
      reason,
    },
    final_recommendation: finalRecommendation,
  };
}

/**
 * Run debate with simplified options
 */
export async function debateReview(
  question: string,
  path?: string
): Promise<DebateResult> {
  return runDebate({ question, path });
}
