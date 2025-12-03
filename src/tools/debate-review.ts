/**
 * Debate review tool - orchestrates the full debate pipeline
 */

import type { DebateReviewInput, DebateResult } from "../types.js";
import { runDebate } from "../engine/debate.js";

/**
 * Handle MCP tool call for debate_review
 */
export async function handleDebateReview(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input: DebateReviewInput = {
    question: args.question as string,
    includeCritique: args.includeCritique as boolean | undefined,
    path: args.path as string | undefined,
  };

  if (!input.question) {
    throw new Error("Question is required for debate review");
  }

  try {
    const result = await runDebate({
      question: input.question,
      includeCritique: input.includeCritique,
      path: input.path,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Debate review failed: ${errorMessage}`);
  }
}

/**
 * Run debate review programmatically
 */
export async function debateReview(
  question: string,
  options?: {
    includeCritique?: boolean;
    path?: string;
  }
): Promise<DebateResult> {
  return runDebate({
    question,
    includeCritique: options?.includeCritique,
    path: options?.path,
  });
}
