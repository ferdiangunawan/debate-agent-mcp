/**
 * Review prompt templates for P0/P1/P2 severity code review
 */

import type { Platform } from "../types.js";
import { getPlatformRules } from "./platform-rules.js";

export const REVIEW_SYSTEM_PROMPT = `You are a strict code reviewer. Focus only on correctness, regressions, risky edge cases, security/privacy issues, and missing or insufficient tests. Ignore style, formatting, or subjective preferences.

## Severity Levels

| Level | Criteria |
|-------|----------|
| **P0** | Breaking defects, crashes, data loss, security/privacy problems, guaranteed failures, build blockers, or release-stopping issues |
| **P1** | Likely bugs/regressions, incorrect logic, missing error-handling, or missing/insufficient tests for risky or stateful code |
| **P2** | Minor correctness issues, small logic gaps, or test gaps that should be fixed but are not release-blocking |

## Output Format

You MUST respond with valid JSON only. No markdown, no explanation outside JSON.

{
  "findings": [
    {
      "severity": "P0",
      "title": "Short issue title",
      "file": "path/to/file:line_number",
      "detail": "One or two sentence explanation of the issue",
      "fix": "Concrete fix or test suggestion"
    }
  ],
  "residual_risks": [
    "Short note on any remaining uncertainty or edge cases that deserve tests"
  ],
  "open_questions": [
    "Clarifying question if the intent or logic is ambiguous"
  ]
}

Rules:
- Order findings by severity: P0 first, then P1, then P2
- If no issues found, return empty findings array
- Always include file path and line number when possible
- Be specific and actionable in fix suggestions
- Focus ONLY on the diff/changes provided
- Never comment on unrelated code`;

export function buildReviewPrompt(
    question: string,
    diff: string,
    platform: Platform = "general"
): string {
    const platformRules = getPlatformRules(platform);

    return `${REVIEW_SYSTEM_PROMPT}

## Platform-Specific Scrutiny
${platformRules}

## Review Request
${question}

## Git Diff to Review
\`\`\`diff
${diff}
\`\`\`

Respond with JSON only.`;
}

export function buildCritiquePrompt(
    otherAgentName: string,
    otherAgentReview: string,
    diff: string,
    platform: Platform = "general"
): string {
    const platformRules = getPlatformRules(platform);

    return `You are reviewing another AI agent's code review. Critique the following review and identify any issues, missed points, or incorrect assessments.

## Platform-Specific Scrutiny
${platformRules}

## Original Git Diff
\`\`\`diff
${diff}
\`\`\`

## ${otherAgentName.toUpperCase()}'s Review
${otherAgentReview}

## Your Task
Analyze the review and respond with JSON:

{
  "correct_points": ["Points where the review is correct"],
  "incorrect_points": ["Points where the review is incorrect or misleading"],
  "missed_issues": [
    {
      "severity": "P0|P1|P2",
      "title": "Issue title",
      "file": "path:line",
      "detail": "Description",
      "fix": "Suggestion"
    }
  ],
  "overall_assessment": "Brief assessment of review quality"
}

Respond with JSON only.`;
}

export function buildDebatePlanPrompt(
    topic: string,
    agents: string[],
    mode: string,
    rounds: number
): string {
    return `Create a structured debate plan for the following:

Topic: ${topic}
Participating Agents: ${agents.join(", ")}
Mode: ${mode}
Rounds: ${rounds}

For each round, define what each agent should focus on based on the mode:
- consensus: Find common ground and build agreement
- adversarial: Challenge assumptions and find weaknesses
- collaborative: Build on each other's ideas constructively

The plan should guide agents toward a comprehensive code review.`;
}
